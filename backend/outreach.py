"""
Outreach helpers: LLM email generation, Gmail SMTP send, IMAP reply polling.

Logging:
  - Email generation success/failure is logged with masked recipient.
  - Gmail send success/failure is logged with masked recipient.
  - IMAP poll outcomes are logged.
  - Call reply generation is logged.
"""
import os
import re
import ssl
import json
import uuid
import email
import smtplib
import imaplib
import socket
from html import escape
from email.utils import make_msgid, parseaddr, formatdate
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from emergentintegrations.llm.chat import LlmChat, UserMessage
from enrich import enrich_lead

from utils.logger import get_logger, mask_secret

logger = get_logger(__name__)


class _IPv4SMTP(smtplib.SMTP):
    """SMTP client that avoids unreachable IPv6 routes on some hosts."""

    def _get_socket(self, host, port, timeout):
        addresses = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if timeout is not None:
            sock.settimeout(timeout)
        sock.connect(addresses[0][4])
        return sock


class _IPv4SMTPSSL(smtplib.SMTP_SSL):
    """SMTP-over-SSL client that avoids unreachable IPv6 routes."""

    def _get_socket(self, host, port, timeout):
        addresses = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if timeout is not None:
            sock.settimeout(timeout)
        sock.connect(addresses[0][4])
        return self.context.wrap_socket(sock, server_hostname=host)

# ─── LLM Config ───────────────────────────────────────────────────────────────

EMERGENT_LLM_KEY: str = os.environ.get("EMERGENT_LLM_KEY", "")
LLM_MODEL = ("openai", "gpt-5.4-mini")


async def resolve_llm_key() -> str:
    """
    Resolve the LLM API key at call time from ``llm_config`` (Settings page,
    then env vars).
    """
    try:
        import llm_config
        key = await llm_config.get_api_key()
        if key:
            return key
    except Exception:
        pass
    return os.environ.get("OPENAI_API_KEY", "").strip() or EMERGENT_LLM_KEY.strip()


# ─── AI Email Generation ──────────────────────────────────────────────────────

async def generate_outreach_email(
    lead: Dict[str, Any],
    sender_name: str = "Web Services Team",
    source_mode: str = "maps",
    client_name: str = "",
) -> Dict[str, str]:
    """
    Generate a personalised cold-outreach email using GPT-5.2.

    Fetches real business data (reviews, summary, hours) from Google Places
    first so the email references genuine, specific details about the client.

    Falls back to a generic template if LLM is not configured.

    Args:
        lead:        Lead document from MongoDB.
        sender_name: Sender display name used in the email sign-off.

    Returns:
        Dict with ``subject`` and ``body`` keys.
    """
    source_mode = (source_mode or "maps").strip().lower()
    client_name = (client_name or "").strip()

    tone_by_source = {
        "maps": "local businesses that are active in your area",
        "web": "businesses with public websites that may be missing stronger lead capture",
        "directory": "businesses listed in directories that can benefit from better visibility",
        "social": "brands with social presence that can convert better with a stronger site",
        "reviews": "businesses with customer traction and clear reputation signals",
        "jobs": "companies actively hiring and likely in growth mode",
    }
    angle = tone_by_source.get(source_mode, "businesses that could benefit from a stronger online presence")

    fallback = {
        "subject": f"Quick idea for {lead.get('name', 'your business')}",
        "body": (
            f"Hi {lead.get('name', 'there')},\n\n"
            f"I was reviewing {angle} and your business stood out. "
            f"I think there is a simple opportunity to improve your online presence and turn that into more inquiries.\n\n"
            "If useful, I can share a short plan and a few quick wins."
        ),
    }

    api_key = await resolve_llm_key()
    if not api_key:
        logger.info(
            "Email generation skipped — no OpenAI key (add one in Settings) | lead=%s",
            lead.get("id"),
        )
        return fallback

    ctx = await enrich_lead(lead)

    types = ", ".join(ctx["types"] or [lead.get("category_searched", "business")])
    reviews_txt = "\n".join(
        f"- \"{s['text']}\" (rated {s['rating']} by {s['author']})"
        for s in ctx["review_snippets"]
    ) or "No review snippets available."

    prompt = f"""You are a professional outreach specialist writing a short, friendly email.

BUSINESS (from Google):
- Name: {ctx['name'] or 'Unknown'}
- Category: {types}
- Address: {ctx['address'] or 'N/A'}
- Google rating: {ctx['rating'] or 'N/A'} ({ctx['reviews_count'] or 0} reviews)
- Phone: {ctx['phone'] or 'N/A'}
- Opening hours: {ctx['opening_hours'] or 'N/A'}
- Google summary: {ctx['editorial_summary'] or 'N/A'}
- Recent customer reviews:
{reviews_txt}

SOURCE CONTEXT:
- Discovery source: {source_mode}
- Client/project: {client_name or 'N/A'}

TASK: Write a warm, short, highly personalized cold-outreach email (max 140 words) that fits the discovery source.
1. Open with a specific, genuine observation based on the data above.
2. Tailor the angle to the source context.
3. Offer a low-risk next step.
4. End with a soft call to action.
5. Do NOT add any sign-off or signature line — a professional signature is added automatically after the body.

Rules:
- Sound human, not like a template. No hype, no exclamation marks spam.
- Only use facts that appear in the Google data provided; never invent claims.
- Keep the subject line under 9 words and specific to this business.

Respond ONLY as strict JSON: {{"subject": "...", "body": "..."}}. Use \\n for line breaks in body. No markdown, no code fences, just JSON."""

    chat = LlmChat(
        api_key=api_key,
        session_id=f"outreach-{lead.get('id', uuid.uuid4())}",
        system_message="You write personalized, high-converting cold-outreach emails grounded in real business data. You always respond in valid JSON.",
    ).with_model(*LLM_MODEL)

    try:
        raw = (await chat.send_message(UserMessage(text=prompt))).strip().strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            raw = match.group(0)
        data = json.loads(raw)
        result = {
            "subject": data.get("subject", "").strip(),
            "body": data.get("body", "").strip(),
        }
        logger.info("Email generated | lead=%s lead_name=%s", lead.get("id"), lead.get("name"))
        return result
    except Exception as exc:
        logger.error("Email generation failed | lead=%s error=%s", lead.get("id"), exc)
        return {**fallback, "ai_error": str(exc)}


# ─── AI Thread Summarization ──────────────────────────────────────────────────

async def generate_call_script(
    lead: Dict[str, Any],
    sender_name: str = "",
    business_name: str = "",
) -> Dict[str, str]:
    """
    Generate a short, personalised cold-call talk-track for a lead.

    Uses the same LLM as the email generator. Falls back to a simple
    template when no API key is configured.

    Returns:
        Dict with ``script`` (the talk-track) and optionally ``ai_error``.
    """
    name = lead.get("name") or "your business"
    has_website = bool(lead.get("has_website"))
    rating = lead.get("rating")
    reviews = lead.get("user_ratings_total")
    category = (lead.get("category_searched") or "").replace("_", " ") or "local business"

    fallback_lines = [
        f'Hi {name}, this is {sender_name or "Alex"} — am I speaking with the owner?',
        f"I found your {category} on Google and noticed you're doing well locally.",
    ]
    if not has_website:
        fallback_lines.append("One thing I noticed: you don't show up with a website yet, which means people searching for you can't easily reach you.")
    elif rating:
        fallback_lines.append(f"You've got a {rating}★ rating, which is great — but I think we can turn that reputation into more customers.")
    else:
        fallback_lines.append("I think you could be getting more customers than you are today.")
    fallback_lines.append("I help local businesses fix exactly this. Do you have two minutes for me to explain?")
    fallback = {"script": "\n".join(fallback_lines)}

    api_key = await resolve_llm_key()
    if not api_key:
        logger.info(
            "Call script generation skipped — no LLM key | lead=%s",
            lead.get("id"),
        )
        return fallback

    ctx = await enrich_lead(lead)
    types = ", ".join(ctx["types"] or [lead.get("category_searched", "business")])

    prompt = f"""You are an expert cold-call coach writing a short, natural phone script.

BUSINESS:
- Name: {ctx['name'] or 'Unknown'}
- Category: {types}
- Address: {ctx['address'] or 'N/A'}
- Google rating: {ctx['rating'] or 'N/A'} ({ctx['reviews_count'] or 0} reviews)
- Has website: {bool(ctx.get('website') or lead.get('website'))}
- Google summary: {ctx['editorial_summary'] or 'N/A'}

TASK: Write a cold-call script (max 110 words) in the following 4 parts:
1. OPENING — say hello, your name, and ask if you're speaking with the owner.
2. HOOK — one specific, true observation about THIS business (its rating, category, or missing website).
3. OFFER — one sentence: you help local businesses turn reputation into customers.
4. ASK — a low-pressure question, e.g. "Do you have two minutes?"

Rules:
- Sound human, warm, and confident. No hype. No invented facts.
- Label each part with the short heading OPENING / HOOK / OFFER / ASK.
- Respond ONLY as strict JSON: {{"script": "..."}} with \\n between sections. No markdown, no code fences."""

    chat = LlmChat(
        api_key=api_key,
        session_id=f"callscript-{lead.get('id', uuid.uuid4())}",
        system_message="You write short, natural, high-converting cold-call scripts grounded in real business data. Always respond in valid JSON.",
    ).with_model(*LLM_MODEL)

    try:
        raw = (await chat.send_message(UserMessage(text=prompt))).strip().strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            raw = match.group(0)
        data = json.loads(raw)
        result = {"script": data.get("script", "").strip()}
        logger.info("Call script generated | lead=%s", lead.get("id"))
        return result or fallback
    except Exception as exc:
        logger.error("Call script generation failed | lead=%s error=%s", lead.get("id"), exc)
        return {**fallback, "ai_error": str(exc)}


# ─── Bilingual (EN/HI) Proposal Generation ───────────────────────────────────

async def generate_proposal(
    lead: Dict[str, Any],
    sender_name: str = "Web Services Team",
    client_name: str = "",
) -> Dict[str, Any]:
    """
    Generate a detailed service proposal for a lead in both English and Hindi.

    Returns a dict with ``proposal_en`` and ``proposal_hi`` plain-text strings
    (both sendable over WhatsApp). Falls back to a bilingual template when no
    LLM key is configured.
    """
    name = lead.get("name") or "your business"
    category = (lead.get("category_searched") or "").replace("_", " ") or "local business"
    has_website = bool(lead.get("has_website"))
    website = lead.get("website") or ""
    rating = lead.get("rating")
    reviews = lead.get("user_ratings_total")
    phone = lead.get("phone") or ""
    address = lead.get("address") or ""
    client = (client_name or "").strip() or sender_name

    fallback_en = (
        f"Hi {name},\n\n"
        f"Thank you for your time today. Based on our conversation, here is a quick proposal.\n\n"
        f"CURRENT SITUATION\n"
        f"- Category: {category}\n"
        f"- Google rating: {rating or 'N/A'} ({reviews or 0} reviews)\n"
        f"- Website: {website or 'Not present'}\n"
        f"- Phone: {phone or 'N/A'}\n"
        f"- Address: {address or 'N/A'}\n\n"
        f"WHAT I PROPOSE\n"
        f"1. A professional website for {name} that works on mobile and ranks on Google.\n"
        f"2. Google Business Profile optimisation so customers find you easily.\n"
        f"3. Local SEO + online review management to turn ratings into bookings.\n\n"
        f"BENEFITS\n"
        f"- More customers from Google searches\n"
        f"- A professional image that builds trust\n"
        f"- Easy booking / contact from your site\n\n"
        f"NEXT STEP\n"
        f"Reply to this message or call {client} to confirm a start time. We can begin this week.\n\n"
        f"Thanks,\n{client}"
    )
    fallback_hi = (
        f"नमस्ते {name},\n\n"
        f"आज बात करने के लिए धन्यवाद। आपके लिए एक छोटा प्रस्ताव नीचे दिया गया है।\n\n"
        f"वर्तमान स्थिति\n"
        f"- श्रेणी: {category}\n"
        f"- Google रेटिंग: {rating or 'N/A'} ({reviews or 0} समीक्षाएँ)\n"
        f"- वेबसाइट: {website or 'मौजूद नहीं'}\n"
        f"- फ़ोन: {phone or 'N/A'}\n"
        f"- पता: {address or 'N/A'}\n\n"
        f"मेरा प्रस्ताव\n"
        f"1. {name} के लिए एक प्रोफेशनल वेबसाइट जो मोबाइल पर चले और Google पर दिखे।\n"
        f"2. Google Business Profile को बेहतर बनाना ताकि ग्राहक आपको आसानी से खोजें।\n"
        f"3. Local SEO और रिव्यू मैनेजमेंट से रेटिंग को बुकिंग में बदलना।\n\n"
        f"फ़ायदे\n"
        f"- Google सर्च से ज़्यादा ग्राहक\n"
        f"- विश्वास बढ़ाने वाली प्रोफेशनल छवि\n"
        f"- वेबसाइट से आसान बुकिंग / संपर्क\n\n"
        f"अगला कदम\n"
        f"इस मैसेज का जवाब दें या {client} से कॉल करें। हम इसी हफ्ते शुरू कर सकते हैं।\n\n"
        f"धन्यवाद,\n{client}"
    )
    fallback = {"proposal_en": fallback_en, "proposal_hi": fallback_hi}

    api_key = await resolve_llm_key()
    if not api_key:
        logger.info(
            "Proposal generation skipped — no LLM key | lead=%s",
            lead.get("id"),
        )
        return fallback

    ctx = await enrich_lead(lead)
    types = ", ".join(ctx["types"] or [lead.get("category_searched", "business")])
    reviews_txt = "\n".join(
        f"- \"{s['text']}\" (rated {s['rating']} by {s['author']})"
        for s in ctx["review_snippets"]
    ) or "No review snippets available."

    prompt = f"""You are a professional web agency writing a detailed, persuasive service proposal for a small local business.

BUSINESS (from Google):
- Name: {ctx['name'] or 'Unknown'}
- Category: {types}
- Address: {ctx['address'] or 'N/A'}
- Google rating: {ctx['rating'] or 'N/A'} ({ctx['reviews_count'] or 0} reviews)
- Phone: {ctx['phone'] or 'N/A'}
- Website: {ctx['website'] or 'Not present'}
- Google summary: {ctx['editorial_summary'] or 'N/A'}
- Recent customer reviews:
{reviews_txt}

YOUR AGENCY:
- Sender / contact: {client}

TASK: Write TWO versions of a detailed service proposal for this business:
1. "proposal_en" — a professional proposal in English.
2. "proposal_hi" — the exact same proposal in natural Hindi (Devanagari script).

Both proposals must include these sections (with clear headings):
- Greeting: address the business owner by name, warm but professional.
- Current situation: 2-3 specific, true observations from the Google data (rating, reviews, missing website, category).
- What I propose: a clear plan with 3-4 services (website, Google Business Profile, local SEO, review management, online booking/contact) tailored to THIS business.
- Benefits: 3-4 concrete outcomes (more customers from Google, trust, easy booking, etc.).
- Investment & timeline: a simple note that pricing depends on scope and work can start within a week.
- Next step: ask them to reply on WhatsApp or call {client} to begin.
- Sign-off: your name.

Rules:
- Sound human and confident, never like a copy-paste template.
- Only use facts from the Google data; never invent claims.
- Keep each proposal around 250-350 words. Use \\n for line breaks, no markdown symbols, no emojis.
- The Hindi version must be a real translation, not English words written in Devanagari.

Respond ONLY as strict JSON: {{"proposal_en": "...", "proposal_hi": "..."}}. No markdown, no code fences, just JSON."""

    chat = LlmChat(
        api_key=api_key,
        session_id=f"proposal-{lead.get('id', uuid.uuid4())}",
        system_message="You write detailed, persuasive bilingual (English + Hindi) web service proposals grounded in real business data. Always respond in valid JSON.",
    ).with_model(*LLM_MODEL)

    try:
        raw = (await chat.send_message(UserMessage(text=prompt))).strip().strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            raw = match.group(0)
        data = json.loads(raw)
        result = {
            "proposal_en": (data.get("proposal_en") or "").strip(),
            "proposal_hi": (data.get("proposal_hi") or "").strip(),
        }
        if not result["proposal_en"] or not result["proposal_hi"]:
            return fallback
        logger.info("Bilingual proposal generated | lead=%s", lead.get("id"))
        return result
    except Exception as exc:
        logger.error("Proposal generation failed | lead=%s error=%s", lead.get("id"), exc)
        return {**fallback, "ai_error": str(exc)}


# ─── AI Thread Summarization ──────────────────────────────────────────────────

async def summarize_thread(sent_body: str, reply_body: str) -> str:
    """
    Summarize the outreach → reply exchange in 2–3 sentences.

    Args:
        sent_body:  The body of the email we sent.
        reply_body: The body of the reply received.

    Returns:
        A short summary string.
    """
    api_key = await resolve_llm_key()
    if not api_key:
        return (reply_body or "")[:280]

    prompt = f"""Summarize this outreach + reply exchange in 2-3 short sentences.
Focus on the reply's intent (interested/not interested/asking questions) and any action needed.

OUR EMAIL:
{sent_body[:1500]}

THEIR REPLY:
{reply_body[:2500]}

Return ONLY the summary text, no preamble."""

    chat = LlmChat(
        api_key=api_key,
        session_id=f"summary-{uuid.uuid4()}",
        system_message="You summarize sales email exchanges concisely.",
    ).with_model(*LLM_MODEL)

    try:
        summary = (await chat.send_message(UserMessage(text=prompt))).strip()
        logger.debug("Thread summary generated (%d chars)", len(summary))
        return summary
    except Exception as exc:
        logger.error("Thread summary failed | error=%s", exc)
        return (reply_body or "")[:280]


# ─── AI Agent Chat ────────────────────────────────────────────────────────────

async def agent_chat(
    message: str,
    context: Dict[str, Any],
    history: List[Dict[str, str]],
) -> Dict[str, Any]:
    """
    In-app AI assistant. Answers Q&A and detects action intent.

    Args:
        message: The user's message.
        context: App-level context dict (lead counts, email stats, etc.).
        history: Recent conversation history (list of {role, content}).

    Returns:
        Dict with ``reply`` (str) and ``action`` (Optional[dict]).
    """
    api_key = await resolve_llm_key()
    if not api_key:
        logger.warning("AI agent skipped — no OpenAI key (add one in Settings)")
        return {"reply": "AI agent not configured. Please contact admin.", "action": None}

    system = f"""You are the LeadGen Command Center in-app assistant. You help the operator prospect local businesses without websites and manage their sales pipeline.

App features you know about:
- New Search page: enter location + category → fetches Google Maps businesses
- Leads page: pipeline (new/contacted/interested/converted/rejected), notes, CSV export, bulk actions
- Schedules page: daily auto-searches (configurable hour/minute UTC)
- Outreach: AI-generated emails via GPT-5.2, sent through Gmail SMTP, replies auto-summarized
- Settings: Google Maps API key + Gmail SMTP creds

Operator context:
- Total leads: {context.get('total_leads', 0)}
- Hot (no website) leads: {context.get('no_website_leads', 0)}
- Emails sent: {context.get('emails_sent', 0)}
- Replies: {context.get('replies', 0)}

You can trigger these actions when the user clearly asks:
- search: {{"type":"search","params":{{"location":"...","category":"restaurant|spa|hotel|..."}}}}
- open_page: {{"type":"open_page","params":{{"page":"dashboard|search|leads|schedules|outreach|settings"}}}}

Respond STRICTLY as JSON: {{"reply":"friendly conversational answer","action": null | {{"type":"...","params":{{...}}}}}}
Keep replies short (max 3 sentences). No markdown, just JSON."""

    chat = LlmChat(
        api_key=api_key,
        session_id=context.get("session_id", str(uuid.uuid4())),
        system_message=system,
    ).with_model(*LLM_MODEL)

    # Build conversation history string from last 6 turns
    hist_text = ""
    for h in history[-6:]:
        hist_text += f"\n{h['role'].upper()}: {h['content']}"
    full_message = f"{hist_text}\nUSER: {message}" if hist_text else message

    try:
        raw = (await chat.send_message(UserMessage(text=full_message))).strip().strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            raw = match.group(0)
        data = json.loads(raw)
        result = {"reply": data.get("reply", ""), "action": data.get("action")}
        logger.debug("Agent chat | session=%s action=%s", context.get("session_id"), result["action"])
        return result
    except Exception as exc:
        logger.error("Agent chat failed | session=%s error=%s", context.get("session_id"), exc)
        return {"reply": "Sorry, I had trouble processing that. Try rephrasing?", "action": None}


# ─── Gmail SMTP Send ──────────────────────────────────────────────────────────

def build_signature(sender_name: str, sender_email: str = "", signature_lines: str = "") -> str:
    """
    Build a professional plain-text signature block from the settings.

    Args:
        sender_name:  Display name / title from Settings (e.g. "Nitish - Software Engineer & DevOps Engineer").
        sender_email: The Gmail address used to send (optional, added as contact).
        signature_lines: Custom signature lines from Settings (optional). When provided,
                         replaces the default "DevOps Engineer" / "Full Stack Engineer" lines.

    Returns:
        A plain-text signature ending with a newline, or an empty string.
    """
    name = (sender_name or "").strip()
    if not name:
        return ""
    custom = [ln.strip() for ln in (signature_lines or "").strip().splitlines() if ln.strip()]
    if custom:
        lines = [name] + custom
    else:
        lines = [
            name,
            "DevOps Engineer",
            "Full Stack Engineer",
        ]
    if sender_email:
        lines.append(sender_email)
    lines.append("")
    return "\n".join(lines)


def _html_signature_block(sig: str) -> str:
    """Render the plain-text signature as a small styled HTML block."""
    raw_lines = [l for l in sig.rstrip().splitlines() if l.strip()]
    if not raw_lines:
        return ""
    html = ['<table role="presentation" style="margin-top:24px;border-top:1px solid #dddddd;padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#333333;">']
    for i, line in enumerate(raw_lines):
        style = "color:#555555;" if i == 0 else ""
        html.append(f'  <tr><td style="{style}">{escape(line)}</td></tr>')
    html.append("</table>")
    return "\n".join(html)


def _htmlize_body(body: str, signature: str = "") -> str:
    """Convert a plain-text body (and optional signature) into a clean HTML email."""
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", (body or "")) if p.strip()]
    inner = []
    for para in paragraphs:
        safe = escape(para).replace("\n", "<br />")
        inner.append(f'<p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222222;">{safe}</p>')
    if signature:
        inner.append(_html_signature_block(signature))
    return (
        "<html><body style=\"margin:0;padding:24px;background:#f7f7f7;\">"
        f'<div style="background:#ffffff;max-width:620px;margin:0 auto;padding:32px;border-radius:6px;">{"".join(inner)}</div>'
        "</body></html>"
    )


def send_gmail(
    from_email: str,
    from_password: str,
    from_name: str,
    to_email: str,
    subject: str,
    body: str,
    signature: str = "",
) -> Dict[str, Any]:
    """
    Send an email via Gmail SMTP (SSL) with deliverability-friendly headers.

    Adds a proper ``Message-ID`` on the real sending domain, ``Date``,
    ``Reply-To`` and a plain-text + HTML multipart alternative, so the
    message is far less likely to land in spam.

    Args:
        from_email:    Sender Gmail address.
        from_password: Gmail app password (not the account password).
        from_name:     Display name for the From header.
        to_email:      Recipient email address.
        subject:       Email subject line.
        body:          Plain-text email body.
        signature:     Optional plain-text signature appended to the body.

    Returns:
        Dict with ``ok`` (bool), ``message_id`` (str), and optionally ``error`` (str).
    """
    if not from_email or not from_password:
        logger.warning("Gmail send skipped — credentials not configured")
        return {"ok": False, "error": "Gmail credentials not configured"}

    if not to_email:
        logger.warning("Gmail send skipped — no recipient address")
        return {"ok": False, "error": "No recipient email"}

    text_body = body.strip()
    if signature:
        text_body += "\n\n" + signature.strip()

    from email.message import EmailMessage

    msg = EmailMessage()
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Reply-To"] = from_email
    msg["X-Mailer"] = "LeadGen"
    # Use the real sending domain in Message-ID (fake domains are a spam signal)
    sending_domain = from_email.split("@")[-1] if "@" in from_email else "gmail.com"
    message_id = make_msgid(domain=sending_domain)
    msg["Message-ID"] = message_id
    msg["List-Unsubscribe"] = f"<mailto:{from_email}?subject=unsubscribe>"

    # Plain-text + HTML alternative (SMTP policy picks 7bit/quoted-printable for ASCII)
    msg.set_content(text_body, subtype="plain")
    msg.add_alternative(_htmlize_body(text_body, signature), subtype="html")

    # Some hosting providers block implicit TLS (465), while allowing the
    # equivalent STARTTLS connection (587). Try both before reporting failure.
    smtp_errors = []
    for port in (465, 587):
        try:
            ctx = ssl.create_default_context()
            if port == 465:
                server = _IPv4SMTPSSL("smtp.gmail.com", port, context=ctx, timeout=20)
            else:
                server = _IPv4SMTP("smtp.gmail.com", port, timeout=20)
                server.starttls(context=ctx)
            with server:
                server.login(from_email, from_password)
                server.sendmail(from_email, [to_email], msg.as_string())

            logger.info(
                "Email sent | from=%s to=%s subject=%s message_id=%s smtp_port=%d",
                from_email,
                mask_secret(to_email, 3),
                subject[:60],
                message_id,
                port,
            )
            return {"ok": True, "message_id": message_id}

        except smtplib.SMTPAuthenticationError:
            logger.error(
                "Gmail auth failed | from=%s — check app password", from_email
            )
            return {"ok": False, "error": "Gmail authentication failed. Check your app password."}
        except (OSError, smtplib.SMTPException) as exc:
            smtp_errors.append(f"port {port}: {exc}")
            logger.warning(
                "Gmail SMTP connection failed | from=%s port=%d error=%s",
                from_email, port, exc,
            )

    error = "Unable to reach Gmail SMTP. Check the server's outbound network access and firewall (ports 465/587)."
    if smtp_errors:
        last_error = smtp_errors[-1].split(": ", 1)[-1]
        if not isinstance(last_error, str) or "Network is unreachable" not in last_error:
            error = f"Gmail SMTP connection failed: {last_error}"
    logger.error(
        "Gmail send failed | from=%s to=%s errors=%s",
        from_email, mask_secret(to_email, 3), smtp_errors,
    )
    return {"ok": False, "error": error}


# ─── IMAP Reply Fetching ──────────────────────────────────────────────────────

def _decode(s) -> str:
    """Safely decode a bytes-or-str email header value."""
    if isinstance(s, bytes):
        try:
            return s.decode("utf-8", errors="ignore")
        except Exception:
            return s.decode(errors="ignore")
    return s or ""


def fetch_replies(
    from_email: str,
    from_password: str,
    since_days: int = 14,
) -> List[Dict[str, Any]]:
    """
    Poll Gmail inbox via IMAP for email replies.

    Note: This is a synchronous blocking function. Call it via
    ``asyncio.to_thread(fetch_replies, ...)`` from async context.

    Args:
        from_email:    Gmail address to poll.
        from_password: Gmail app password.
        since_days:    How many days back to search (default: 14).

    Returns:
        List of reply dicts with keys: from, subject, in_reply_to, references, body, date.
    """
    if not from_email or not from_password:
        return []

    try:
        M = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        M.login(from_email, from_password)
        M.select("INBOX")

        since_dt = datetime.now(timezone.utc) - timedelta(days=since_days)
        since_str = since_dt.strftime("%d-%b-%Y")

        status, data = M.search(None, f"(SINCE {since_str})")
        if status != "OK":
            logger.warning("IMAP search returned non-OK status | from=%s", from_email)
            M.logout()
            return []

        message_ids = data[0].split()[-100:]  # cap at last 100
        results: List[Dict[str, Any]] = []

        for msg_num in message_ids:
            status, msg_data = M.fetch(msg_num, "(RFC822)")
            if status != "OK":
                continue

            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)

            in_reply_to = _decode(msg.get("In-Reply-To", "")).strip()
            references = _decode(msg.get("References", "")).strip()

            # Only process replies (must have In-Reply-To or References)
            if not in_reply_to and not references:
                continue

            from_addr = parseaddr(_decode(msg.get("From", "")))[1]
            subject = _decode(msg.get("Subject", ""))
            date = _decode(msg.get("Date", ""))
            body = ""

            if msg.is_multipart():
                for part in msg.walk():
                    if (
                        part.get_content_type() == "text/plain"
                        and "attachment" not in _decode(part.get("Content-Disposition", ""))
                    ):
                        try:
                            body = part.get_payload(decode=True).decode("utf-8", errors="ignore")
                            break
                        except Exception:
                            pass
            else:
                try:
                    body = msg.get_payload(decode=True).decode("utf-8", errors="ignore")
                except Exception:
                    body = str(msg.get_payload())

            results.append({
                "from": from_addr,
                "subject": subject,
                "in_reply_to": in_reply_to,
                "references": references,
                "body": body.strip()[:5000],
                "date": date,
            })

        M.logout()
        logger.info(
            "IMAP poll completed | from=%s since_days=%d messages_scanned=%d replies_found=%d",
            from_email, since_days, len(message_ids), len(results),
        )
        return results

    except imaplib.IMAP4.error as exc:
        logger.error("IMAP auth/connection error | from=%s error=%s", from_email, exc)
        return []
    except Exception as exc:
        logger.error("IMAP fetch failed | from=%s error=%s", from_email, exc)
        return []
