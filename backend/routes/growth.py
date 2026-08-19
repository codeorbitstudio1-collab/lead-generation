import asyncio
import random
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from fastapi import HTTPException, Depends

from utils.logger import get_logger, mask_secret

logger = get_logger(__name__)

from core import (
    api,
    db,
    get_current_user,
    get_setting_value,
    DiscoverEmailIn,
    TemplateIn,
    TemplateUpdate,
    ABGroupIn,
    OutreachSendIn,
    AgentChatIn,
)
from discovery import EMAIL_RE, scrape_emails, search_emails_for_business, render_template, build_lead_vars
from outreach import generate_outreach_email, summarize_thread, send_gmail, fetch_replies, agent_chat, build_signature
from routes.crm import record_contact



@api.post("/leads/{lead_id}/discover-email")
async def discover_email(lead_id: str, body: DiscoverEmailIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    url = (body.website_url or lead.get("website") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="No website URL for this lead. Provide 'website_url' or update the lead's website.")
    result = await scrape_emails(url)
    now_iso = datetime.now(timezone.utc).isoformat()
    update = {"discovered_emails": result["emails"], "updated_at": now_iso}
    if result.get("best"):
        update["discovered_email"] = result["best"]
    # If lead had no website in db but user provided one, save it
    if not lead.get("website") and body.website_url:
        update["website"] = url
        update["has_website"] = True
    await db.leads.update_one({"id": lead_id}, {"$set": update})
    return {"lead_id": lead_id, **result}


@api.post("/leads/{lead_id}/discover-email/auto")
async def discover_email_auto(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    url = (lead.get("website") or "").strip()
    result = {"emails": [], "best": None, "pages_checked": 0}
    if url:
        result = await scrape_emails(url)
    if not result.get("emails"):
        # Fallback: search the web for the business name even without a website.
        search_result = await search_emails_for_business(
            lead.get("name", ""),
            lead.get("location_searched") or lead.get("address", ""),
        )
        for key in ("emails", "best", "pages_checked"):
            if key in search_result:
                result[key] = search_result[key]
    now_iso = datetime.now(timezone.utc).isoformat()
    update = {"discovered_emails": result["emails"], "updated_at": now_iso}
    if result.get("best"):
        update["discovered_email"] = result["best"]
    await db.leads.update_one({"id": lead_id}, {"$set": update})
    return {"lead_id": lead_id, **result}

# ---- Templates ----

@api.get("/templates")
async def list_templates(user: dict = Depends(get_current_user)):
    items = await db.templates.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"templates": items}

@api.post("/templates")
async def create_template(body: TemplateIn, user: dict = Depends(get_current_user)):
    tid = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": tid,
        "user_id": user["id"],
        "name": body.name,
        "subject": body.subject,
        "body": body.body,
        "is_active": body.is_active,
        "sent_count": 0,
        "reply_count": 0,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.templates.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc

@api.patch("/templates/{tid}")
async def update_template(tid: str, body: TemplateUpdate, user: dict = Depends(get_current_user)):
    existing = await db.templates.find_one({"id": tid, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.templates.update_one({"id": tid}, {"$set": update})
    doc = await db.templates.find_one({"id": tid}, {"_id": 0})
    return doc

@api.delete("/templates/{tid}")
async def delete_template(tid: str, user: dict = Depends(get_current_user)):
    result = await db.templates.delete_one({"id": tid, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"ok": True}

@api.post("/templates/{tid}/preview")
async def preview_template(tid: str, lead_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    tpl = await db.templates.find_one({"id": tid, "user_id": user["id"]}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    sender_name = await get_setting_value("sender_name") or user.get("name") or "Web Services Team"
    if lead_id:
        lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
    else:
        lead = None
    sample = lead or {"name": "Sample Business", "category_searched": "restaurant", "rating": 4.5, "user_ratings_total": 200, "address": "Sample St, Sample City", "phone": "+91-9000000000"}
    variables = build_lead_vars(sample, sender_name)
    return {
        "subject": render_template(tpl["subject"], variables),
        "body": render_template(tpl["body"], variables),
        "variables_used": variables,
    }

# ---- A/B Groups ----

@api.get("/ab-groups")
async def list_ab_groups(user: dict = Depends(get_current_user)):
    items = await db.ab_groups.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"groups": items}

@api.post("/ab-groups")
async def create_ab_group(body: ABGroupIn, user: dict = Depends(get_current_user)):
    if body.variant_a_template_id == body.variant_b_template_id:
        raise HTTPException(status_code=400, detail="Variant A and B must be different templates")
    # Validate templates
    a = await db.templates.find_one({"id": body.variant_a_template_id, "user_id": user["id"]})
    b = await db.templates.find_one({"id": body.variant_b_template_id, "user_id": user["id"]})
    if not a or not b:
        raise HTTPException(status_code=400, detail="Both template IDs must belong to you")
    gid = str(uuid.uuid4())
    doc = {
        "id": gid,
        "user_id": user["id"],
        "name": body.name,
        "variant_a_template_id": body.variant_a_template_id,
        "variant_b_template_id": body.variant_b_template_id,
        "active": body.active,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ab_groups.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc

@api.delete("/ab-groups/{gid}")
async def delete_ab_group(gid: str, user: dict = Depends(get_current_user)):
    result = await db.ab_groups.delete_one({"id": gid, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"ok": True}

@api.get("/ab-groups/{gid}/stats")
async def ab_group_stats(gid: str, user: dict = Depends(get_current_user)):
    group = await db.ab_groups.find_one({"id": gid, "user_id": user["id"]}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    stats = {"group": group, "variants": []}
    for label, tid in [("A", group["variant_a_template_id"]), ("B", group["variant_b_template_id"])]:
        tpl = await db.templates.find_one({"id": tid, "user_id": user["id"]}, {"_id": 0})
        sent = await db.outreach.count_documents({"user_id": user["id"], "ab_group_id": gid, "variant": label, "status": {"$in": ["sent", "replied"]}})
        replied = await db.outreach.count_documents({"user_id": user["id"], "ab_group_id": gid, "variant": label, "status": "replied"})
        stats["variants"].append({
            "label": label,
            "template_id": tid,
            "template_name": (tpl or {}).get("name", "Deleted template"),
            "sent": sent,
            "replied": replied,
            "reply_rate": round(replied / sent * 100, 1) if sent else 0,
        })
    return stats

# ---- Outreach send/generate ----

@api.post("/outreach/generate/{lead_id}")
async def outreach_generate(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    sender_name = await get_setting_value("sender_name") or user.get("name") or "Web Services Team"
    draft = await generate_outreach_email(lead, sender_name, lead.get("source_mode") or lead.get("source") or "maps", user.get("name") or "")
    gmail_email = await get_setting_value("gmail_email")
    signature = build_signature(sender_name, gmail_email or "", await get_setting_value("email_signature") or "")
    return {"lead_id": lead_id, **draft, "signature": signature}
@api.post("/outreach/send/{lead_id}")
async def outreach_send(lead_id: str, body: OutreachSendIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    gmail_email = await get_setting_value("gmail_email")
    gmail_pass = await get_setting_value("gmail_app_password")
    sender_name = await get_setting_value("sender_name") or user.get("name") or "Web Services Team"

    # Determine recipient (priority: body.to_email > discovered_email > notes email)
    to_email = (body.to_email or "").strip()
    if not to_email:
        to_email = (lead.get("discovered_email") or "").strip()
    if not to_email and lead.get("notes") and "@" in lead["notes"]:
        m = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", lead["notes"])
        if m:
            to_email = m.group(0)
    if not to_email:
        raise HTTPException(status_code=400, detail="No email address available for this lead. Provide 'to_email', run email discovery, or add it to lead notes.")
    if not EMAIL_RE.fullmatch(to_email):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid recipient email address: {to_email}",
        )

    # Determine subject/body — priority: A/B group > template > body/subject given > AI-generate
    variant_label = None
    template_id = body.template_id
    ab_group_id = body.ab_group_id
    subject = body.subject
    email_body = body.body

    if ab_group_id:
        group = await db.ab_groups.find_one({"id": ab_group_id, "user_id": user["id"]})
        if not group:
            raise HTTPException(status_code=404, detail="A/B group not found")
        pick = random.choice(["A", "B"])
        variant_label = pick
        template_id = group["variant_a_template_id"] if pick == "A" else group["variant_b_template_id"]

    if template_id and (not subject or not email_body):
        tpl = await db.templates.find_one({"id": template_id, "user_id": user["id"]})
        if not tpl:
            raise HTTPException(status_code=404, detail="Template not found")
        variables = build_lead_vars(lead, sender_name)
        subject = subject or render_template(tpl["subject"], variables)
        email_body = email_body or render_template(tpl["body"], variables)

    if not subject or not email_body:
        draft = await generate_outreach_email(lead, sender_name, lead.get("source_mode") or lead.get("source") or "maps", user.get("name") or "")
        subject = subject or draft["subject"]
        email_body = email_body or draft["body"]
        if draft.get("ai_error"):
            logger.warning(
                "AI email generation failed, sent fallback | lead=%s error=%s",
                lead_id, draft["ai_error"],
            )

    logger.info(
        "Sending email | lead=%s to=%s gmail_configured=%s template=%s ab_group=%s",
        lead_id, mask_secret(to_email, 3), bool(gmail_email and gmail_pass), template_id, ab_group_id,
    )
    signature = build_signature(sender_name, gmail_email, await get_setting_value("email_signature") or "")
    result = send_gmail(gmail_email, gmail_pass, sender_name, to_email, subject, email_body, signature=signature)
    logger.info(
        "Email send result | lead=%s to=%s ok=%s error=%s",
        lead_id, mask_secret(to_email, 3), result.get("ok"), result.get("error"),
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    outreach_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "lead_id": lead_id,
        "lead_name": lead.get("name"),
        "to_email": to_email,
        "subject": subject,
        "body": email_body,
        "sent_at": now_iso if result.get("ok") else None,
        "message_id": result.get("message_id"),
        "status": "sent" if result.get("ok") else "failed",
        "error": result.get("error"),
        "reply_body": None,
        "reply_at": None,
        "summary": None,
        "template_id": template_id,
        "ab_group_id": ab_group_id,
        "variant": variant_label,
        "created_at": now_iso,
    }
    await db.outreach.insert_one(dict(outreach_doc))
    outreach_doc.pop("_id", None)
    if result.get("ok"):
        # Increment template sent count
        if template_id:
            await db.templates.update_one({"id": template_id}, {"$inc": {"sent_count": 1}})
        if lead.get("status") == "new":
            await db.leads.update_one({"id": lead_id}, {"$set": {"status": "contacted", "updated_at": now_iso}})
        await record_contact(
            lead_id=lead_id,
            user_id=user["id"],
            channel="email",
            direction="outbound",
            status="sent",
            summary=f"{subject}",
            notes=email_body[:500],
            auto_status=False,
        )
    else:
        raise HTTPException(status_code=500, detail=result.get("error") or "Send failed")
    return outreach_doc

@api.get("/outreach")
async def list_outreach(user: dict = Depends(get_current_user)):
    items = await db.outreach.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"emails": items}

@api.get("/outreach/stats")
async def outreach_stats(user: dict = Depends(get_current_user)):
    uid = user["id"]
    sent = await db.outreach.count_documents({"user_id": uid, "status": "sent"})
    replied = await db.outreach.count_documents({"user_id": uid, "status": "replied"})
    failed = await db.outreach.count_documents({"user_id": uid, "status": "failed"})
    return {"sent": sent, "replied": replied, "failed": failed, "reply_rate": round(replied / sent * 100, 1) if sent else 0}

@api.get("/outreach/overview")
async def outreach_overview(user: dict = Depends(get_current_user)):
    """Per-lead outreach hub: contact timeline (calls/SMS/emails) + overall summary.

    Returns every lead that has any logged contact or sent email, sorted by most
    recent activity, so the outreach operator can review the full history and
    the overall response for each lead.
    """
    leads = await db.leads.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    emails = await db.outreach.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    contacts = await db.lead_contacts.find({"user_id": user["id"]}, {"_id": 0}).sort("occurred_at", -1).to_list(1000)

    email_by_lead: Dict[str, List[Any]] = {}
    for e in emails:
        email_by_lead.setdefault(e.get("lead_id"), []).append(e)
    contact_by_lead: Dict[str, List[Any]] = {}
    for c in contacts:
        contact_by_lead.setdefault(c.get("lead_id"), []).append(c)

    result: List[Dict[str, Any]] = []
    for lead in leads:
        lc = contact_by_lead.get(lead["id"], [])
        le = email_by_lead.get(lead["id"], [])
        if not lc and not le:
            continue
        overall = None
        for c in lc:
            if c.get("summary"):
                overall = c["summary"]
                break
        if overall is None:
            for e in le:
                if e.get("summary"):
                    overall = e["summary"]
                    break
        result.append({
            "lead_id": lead["id"],
            "lead_name": lead.get("name"),
            "lead_phone": lead.get("phone"),
            "lead_email": lead.get("email") or lead.get("discovered_email"),
            "lead_status": lead.get("status"),
            "last_contact": lead.get("last_contact"),
            "contact_count": lead.get("contact_count", len(lc)),
            "overall_summary": overall,
            "contacts": lc,
            "emails": le,
        })

    def _sort_key(x: Dict[str, Any]) -> str:
        return (x.get("last_contact") or {}).get("at") or ""
    result.sort(key=_sort_key, reverse=True)
    return {"leads": result}

@api.post("/outreach/poll-replies")
async def poll_replies(user: dict = Depends(get_current_user)):
    """Manual trigger to poll Gmail for replies now."""
    count = await do_poll_replies(user["id"])
    return {"ok": True, "new_replies": count}

async def do_poll_replies(user_id: str) -> int:
    gmail_email = await get_setting_value("gmail_email")
    gmail_pass = await get_setting_value("gmail_app_password")
    if not gmail_email or not gmail_pass:
        return 0
    replies = await asyncio.to_thread(fetch_replies, gmail_email, gmail_pass)
    if not replies:
        return 0
    # Get sent outreach for this user
    sent_outreach = await db.outreach.find({"user_id": user_id, "status": "sent"}).to_list(500)
    matched = 0
    for r in replies:
        # Match by In-Reply-To == our message_id OR sender email == to_email
        matched_out = None
        for o in sent_outreach:
            mid = o.get("message_id") or ""
            if mid and (mid in r.get("in_reply_to", "") or mid in r.get("references", "")):
                matched_out = o
                break
            if r.get("from", "").lower() == (o.get("to_email") or "").lower():
                matched_out = o
                break
        if not matched_out:
            continue
        # Already processed?
        if matched_out.get("status") == "replied":
            continue
        summary = await summarize_thread(matched_out.get("body", ""), r.get("body", ""))
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.outreach.update_one(
            {"id": matched_out["id"]},
            {"$set": {
                "status": "replied",
                "reply_body": r.get("body"),
                "reply_at": now_iso,
                "summary": summary,
                "updated_at": now_iso,
            }},
        )
        # Increment template reply count
        if matched_out.get("template_id"):
            await db.templates.update_one({"id": matched_out["template_id"]}, {"$inc": {"reply_count": 1}})
        # Update lead status to interested
        await db.leads.update_one(
            {"id": matched_out["lead_id"]},
            {"$set": {"status": "interested", "updated_at": now_iso}},
        )
        await record_contact(
            lead_id=matched_out["lead_id"],
            user_id=user_id,
            channel="email",
            direction="inbound",
            status="replied",
            summary=summary,
            notes=r.get("body", "")[:1000],
            auto_status=False,
        )
        matched += 1
    return matched

# ==================== AI Agent ====================

@api.post("/agent/chat")
async def agent_chat_endpoint(body: AgentChatIn, user: dict = Depends(get_current_user)):
    sid = body.session_id or str(uuid.uuid4())
    # Load history
    hist = await db.agent_history.find({"user_id": user["id"], "session_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(50)
    # Load context
    total = await db.leads.count_documents({"user_id": user["id"]})
    no_web = await db.leads.count_documents({"user_id": user["id"], "has_website": False})
    sent = await db.outreach.count_documents({"user_id": user["id"], "status": "sent"})
    replies = await db.outreach.count_documents({"user_id": user["id"], "status": "replied"})
    ctx = {"total_leads": total, "no_website_leads": no_web, "emails_sent": sent, "replies": replies, "session_id": sid}
    result = await agent_chat(body.message, ctx, hist)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.agent_history.insert_one({"user_id": user["id"], "session_id": sid, "role": "user", "content": body.message, "created_at": now_iso})
    await db.agent_history.insert_one({"user_id": user["id"], "session_id": sid, "role": "assistant", "content": result["reply"], "action": result.get("action"), "created_at": now_iso})
    return {"session_id": sid, "reply": result["reply"], "action": result.get("action")}

@api.get("/agent/history")
async def agent_history(session_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: Dict[str, Any] = {"user_id": user["id"]}
    if session_id:
        q["session_id"] = session_id
    items = await db.agent_history.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"messages": list(reversed(items))}
