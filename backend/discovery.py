"""
Website email discovery helpers.

Security note:
  scrape_emails() now validates the target URL against SSRF guard rules
  (no private/loopback IPs, only http/https schemes) before fetching.
"""
import asyncio
import re
import socket
from typing import Any, Dict, List, Set
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from utils.constants import ALLOWED_URL_SCHEMES, PRIVATE_IP_PREFIXES
from utils.logger import get_logger

logger = get_logger(__name__)

# ─── Email Patterns & Heuristics ─────────────────────────────────────────────

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Catches obfuscated addresses like "jane [at] example [dot] com" or "(at)/(dot)"
OBFUSCATED_EMAIL_RE = re.compile(
    r"\b([A-Za-z0-9._%+-]+)\s*[\[(]?\s*at\s*[\])]?\s*([A-Za-z0-9.-]+)\s*[\[(]?\s*dot\s*[\])]?\s*([A-Za-z]{2,})\b",
    re.IGNORECASE,
)

BAD_PREFIXES = (
    "noreply", "no-reply", "donotreply", "example@",
    "test@", "sentry", "wixpress", "sentry.io",
)
GOOD_PREFIXES = (
    "info", "contact", "hello", "hi", "sales",
    "owner", "team", "admin", "office", "support",
)
CONTACT_PATHS = [
    "/contact", "/contact-us", "/contactus", "/contact.html",
    "/contact/", "/contact_us", "/contact-me", "/contact-email",
    "/about", "/about-us", "/reach-us", "/reachout",
    "/get-in-touch", "/impressum", "/team", "/our-team", "/staff",
    "/support", "/help", "/contact-us/", "/get-started",
]


# ─── Email Scoring & Validation ───────────────────────────────────────────────

def _clean(email_str: str) -> str:
    return email_str.strip().strip(".,;:'\"()[]<>").lower()


def _deobfuscate(text: str) -> Set[str]:
    """Extract emails written in obfuscated form, e.g. 'jane [at] example [dot] com'."""
    found: Set[str] = set()
    for match in OBFUSCATED_EMAIL_RE.finditer(text):
        local, domain, tld = match.groups()
        if any(b in local.lower() for b in ("noreply", "no-reply", "example", "sentry")):
            continue
        found.add(f"{local.strip()}@{domain.strip()}.{tld.strip()}".lower())
    return found


def _is_valid(email_str: str) -> bool:
    e = email_str.lower()
    if any(b in e for b in BAD_PREFIXES):
        return False
    if e.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")):
        return False
    return True


def _score(email_str: str) -> int:
    prefix = email_str.lower().split("@", 1)[0]
    if prefix in GOOD_PREFIXES:
        return 10
    if any(prefix.startswith(g) for g in GOOD_PREFIXES):
        return 8
    return 5


# ─── SSRF Guard ───────────────────────────────────────────────────────────────

def _is_ssrf_safe(url: str) -> bool:
    """
    Return True only if the URL is safe to fetch externally.

    Blocks:
      - Non-http/https schemes (file://, ftp://, etc.)
      - Loopback / private / link-local addresses (see utils/constants.py)
      - Hostnames that resolve to private IPs

    Args:
        url: The URL to validate.

    Returns:
        True if the URL passes all SSRF checks, False otherwise.
    """
    parsed = urlparse(url)

    if parsed.scheme not in ALLOWED_URL_SCHEMES:
        logger.warning("SSRF guard: rejected scheme | url=%s", url)
        return False

    host = parsed.hostname or ""

    # Check raw hostname against known-bad prefixes
    lower_host = host.lower()
    if any(lower_host == "localhost" or lower_host.startswith(pfx) for pfx in PRIVATE_IP_PREFIXES):
        logger.warning("SSRF guard: rejected host | host=%s url=%s", host, url)
        return False

    # Attempt DNS resolution and check the resolved IP
    try:
        resolved_ip = socket.gethostbyname(host)
        if any(resolved_ip.startswith(pfx) for pfx in PRIVATE_IP_PREFIXES if not pfx.startswith(":")):
            logger.warning(
                "SSRF guard: resolved to private IP | host=%s ip=%s url=%s",
                host, resolved_ip, url,
            )
            return False
    except socket.gaierror:
        # DNS resolution failed — treat as unsafe
        logger.info("SSRF guard: DNS resolution failed | host=%s", host)
        return False

    return True


# ─── Core Scraper ─────────────────────────────────────────────────────────────

async def scrape_emails(url: str, max_pages: int = 4) -> Dict[str, Any]:
    """
    Fetch a website + a few contact pages and extract email addresses.

    Args:
        url:       The root URL to scrape.
        max_pages: Maximum number of pages to fetch (default: 4).

    Returns:
        Dict with keys:
          - ``emails``:       List of discovered emails (best first).
          - ``best``:         The highest-scored email, or None.
          - ``pages_checked``: Number of pages successfully fetched.
    """
    empty = {"emails": [], "best": None, "pages_checked": 0}

    if not url:
        return empty

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    # ── SSRF Guard ────────────────────────────────────────────────────────────
    if not _is_ssrf_safe(url):
        logger.warning("scrape_emails: SSRF guard blocked url=%s", url)
        return empty

    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    # Build list of URLs to try (home + common contact paths), deduplicated
    seen_urls: Set[str] = set()
    unique_urls: List[str] = []
    for candidate in [url] + [urljoin(base, p) for p in CONTACT_PATHS]:
        if candidate not in seen_urls:
            seen_urls.add(candidate)
            unique_urls.append(candidate)
        if len(unique_urls) >= max_pages + 1:
            break

    found: Set[str] = set()
    pages_ok = 0
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; LeadGenBot/1.0; +https://leadgen.local)",
        "Accept": "text/html,application/xhtml+xml",
    }

    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as hc:
        for page_url in unique_urls[:max_pages + 1]:
            try:
                response = await hc.get(page_url)
                if response.status_code >= 400:
                    continue
                pages_ok += 1
                text = response.text

                # Extract from mailto: links first (higher signal)
                soup = BeautifulSoup(text, "html.parser")
                for anchor in soup.find_all("a", href=True):
                    href: str = anchor["href"]
                    if href.lower().startswith("mailto:"):
                        raw_email = href.split(":", 1)[1].split("?")[0]
                        cleaned = _clean(raw_email)
                        if EMAIL_RE.fullmatch(cleaned) and _is_valid(cleaned):
                            found.add(cleaned)

                # Extract from raw text
                for match in EMAIL_RE.findall(text):
                    cleaned = _clean(match)
                    if _is_valid(cleaned):
                        found.add(cleaned)

                # Extract obfuscated emails (name [at] domain [dot] com)
                found.update(_deobfuscate(text))

            except Exception as exc:
                logger.info("scrape_emails: page fetch failed | url=%s error=%s", page_url, exc)
                continue

    emails = sorted(found, key=lambda e: (-_score(e), e))
    best = emails[0] if emails else None

    logger.info(
        "scrape_emails completed | url=%s pages_checked=%d emails_found=%d best=%s",
        url, pages_ok, len(emails), best or "none",
    )

    return {"emails": emails, "best": best, "pages_checked": pages_ok}


# ─── Web-Search Email Discovery (fallback) ──────────────────────────────────

SEARCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; LeadGenBot/1.0; +https://leadgen.local)",
    "Accept": "text/html",
}


def _extract_emails_from_page(text: str) -> Set[str]:
    found: Set[str] = set()
    for match in EMAIL_RE.findall(text):
        cleaned = _clean(match)
        if _is_valid(cleaned):
            found.add(cleaned)
    found.update(_deobfuscate(text))
    return found


async def search_emails_for_business(
    business_name: str,
    location: str = "",
    max_results: int = 8,
) -> Dict[str, Any]:
    """
    Fallback email discovery: run DuckDuckGo queries for the business name and
    scan the result snippets + pages for emails. Works for businesses without a
    website of their own.

    Args:
        business_name: The business / brand name.
        location:      Optional city/area to narrow the search.
        max_results:   Max pages to visit (default: 8).

    Returns:
        Same shape as ``scrape_emails``: ``emails``, ``best``, ``pages_checked``.
    """
    empty = {"emails": [], "best": None, "pages_checked": 0}
    name = (business_name or "").strip().strip('"')
    if not name:
        return empty

    queries = [f'"{name}" email contact']
    if location:
        queries.append(f'"{name}" "{location}" email')
        queries.append(f'"{name}" {location} contact email')

    found: Set[str] = set()
    pages_ok = 0
    seen_urls: Set[str] = set()

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers=SEARCH_HEADERS) as hc:
        for query in queries:
            try:
                response = await hc.get(
                    "https://html.duckduckgo.com/html/",
                    params={"q": query},
                )
                if response.status_code not in (200, 202):
                    continue
                if response.status_code == 202:
                    # DuckDuckGo rate limit — wait briefly then retry once.
                    await asyncio.sleep(1.5)
                    response = await hc.get(
                        "https://html.duckduckgo.com/html/",
                        params={"q": query},
                    )
                    if response.status_code != 200:
                        continue
                # Extract email addresses straight from the search-result snippets.
                found.update(_extract_emails_from_page(response.text))

                # Collect result URLs and scan a handful of them too.
                links = re.findall(r'result__a[^>]*href="([^"]+)"', response.text)
                for link in links[:max_results]:
                    try:
                        from urllib.parse import unquote
                        match = re.match(r"//duckduckgo\.com/l/\?uddg=([^&]+)", link)
                        url = unquote(match.group(1) if match else link)
                        parsed = urlparse(url)
                        host = (parsed.netloc or "").lower()
                        if not url.startswith(("http://", "https://")):
                            continue
                        if any(b in host for b in ("duckduckgo.com", "google.com")):
                            continue
                        if url in seen_urls:
                            continue
                        seen_urls.add(url)
                        page = await hc.get(url)
                        if page.status_code >= 400:
                            continue
                        pages_ok += 1
                        found.update(_extract_emails_from_page(page.text))
                    except Exception as exc:
                        logger.info("search_emails: page scan failed | url=%s error=%s", link, exc)
                        continue
            except Exception as exc:
                logger.info("search_emails: query failed | q=%s error=%s", query, exc)
                continue

    emails = sorted(found, key=lambda e: (-_score(e), e))
    best = emails[0] if emails else None

    logger.info(
        "search_emails_for_business completed | name=%s emails_found=%d best=%s",
        name, len(emails), best or "none",
    )
    return {"emails": emails, "best": best, "pages_checked": pages_ok}


# ─── Template Rendering ───────────────────────────────────────────────────────

def render_template(template: str, variables: Dict[str, str]) -> str:
    """
    Substitute ``{var_name}`` placeholders with values.
    Missing variables are replaced with an empty string.

    Args:
        template:  Template string with ``{placeholder}`` tokens.
        variables: Mapping of placeholder name → replacement value.

    Returns:
        The rendered string with all placeholders resolved.
    """
    out = template
    for key, value in variables.items():
        out = out.replace("{" + key + "}", str(value) if value is not None else "")
    # Remove any unresolved placeholders
    out = re.sub(r"\{[a-zA-Z_][a-zA-Z0-9_]*\}", "", out)
    return out


def build_lead_vars(lead: dict, sender_name: str) -> Dict[str, str]:
    """Build template variable mapping from a lead document."""
    return {
        "business_name": lead.get("name", ""),
        "name": lead.get("name", ""),
        "category": (
            lead.get("category_searched")
            or (lead.get("types") or [""])[0]
            or ""
        ).replace("_", " "),
        "rating": str(lead.get("rating") or ""),
        "reviews": str(lead.get("user_ratings_total") or ""),
        "address": lead.get("address") or "",
        "location": lead.get("location_searched") or "",
        "phone": lead.get("phone") or "",
        "sender_name": sender_name or "",
    }
