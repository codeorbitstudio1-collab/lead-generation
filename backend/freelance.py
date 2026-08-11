"""
Freelance project fetching: free public job APIs + RSS feeds.

Sources tried (public, no API key required):
  - RemoteOK (https://remoteok.com/api) - remote dev jobs
  - Remotive (https://remotive.com/api/remote-jobs) - remote jobs
  - WeWorkRemotely RSS - remote programming jobs

Upwork/Fiverr/Freelancer block automated scraping (403/ToS) so they are not
fetched; users can add such projects manually with the platform URL.

Logging:
  - Every fetch logs source, query, count, and per-source failures.
"""
import re
import xml.etree.ElementTree as ET
from typing import Any, Dict, List

import httpx

from utils.logger import get_logger

logger = get_logger(__name__)

UA = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    )
}

# Tech keywords used to filter projects toward DevOps / web-dev / software work
DEFAULT_KEYWORDS = [
    "devops", "aws", "azure", "kubernetes", "docker", "terraform", "backend",
    "full-stack", "fullstack", "web", "react", "node", "python", "cloud",
    "infrastructure", "site reliability", "sre", "wordpress", "shopify",
    "website", "software", "frontend", "api", "database",
]


def _extract_emails(text: str) -> List[str]:
    """Pull email addresses out of arbitrary text."""
    if not text:
        return []
    return list(dict.fromkeys(
        m for m in re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", text)
    ))


PHONE_RE = r"(?<!\d)(?:\+?\d{1,3}[\s\-\.]?)?(?:\(\d{2,3}\)[\s\-\.]?)?\d{3}[\s\-\.]?\d{3}[\s\-\.]?\d{4}(?!\d)"

def _extract_phones(text: str) -> List[str]:
    """Pull plausible phone numbers out of arbitrary text."""
    if not text:
        return []
    out = []
    for m in re.findall(PHONE_RE, text):
        if m not in out and _plausible_phone(m):
            out.append(m)
    return out[:3]


def _strip_html(text: str) -> str:
    """Convert simple HTML into readable plain text.

    Preserves paragraph and list structure instead of collapsing into a single
    block, so descriptions stay scannable.
    """
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</p>", "\n\n", text, flags=re.I)
    text = re.sub(r"</li>", "\n", text, flags=re.I)
    text = re.sub(r"</h[1-6]>", "\n\n", text, flags=re.I)
    text = re.sub(r"</(div|tr|td|section|header|footer)>", "\n", text, flags=re.I)
    text = re.sub(r"<li[^>]*>", "\n• ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"&#39;", "'", text)
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
    text = "\n".join(ln for ln in lines if ln)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _matches(text: str, keywords: List[str]) -> bool:
    """True if any keyword appears in the text (case-insensitive)."""
    lowered = (text or "").lower()
    return any(k in lowered for k in keywords)


def _project(
    title: str,
    company: str,
    description: str,
    platform: str,
    platform_url: str,
    location: str,
    salary: str,
    skills: List[str],
    source_id: str,
    posted_at: str,
) -> Dict[str, Any]:
    """Normalise a fetched project into a consistent dict."""
    emails = _extract_emails(description)
    phones = _extract_phones(description)
    return {
        "id": f"{platform}:{source_id}",
        "title": title,
        "company": company,
        "job_description": _strip_html(description)[:6000],
        "requirements": skills[:20],
        "email": emails[0] if emails else "",
        "phones": phones,
        "budget": salary or "",
        "currency": "",
        "platform": platform,
        "platform_url": platform_url,
        "location": location,
        "skills": skills[:20],
        "posted_at": posted_at,
        "is_mock": False,
    }


# ─── Company contact enrichment ──────────────────────────────────────────────

COMPANY_BLOCK_HOSTS = (
    "linkedin.com", "facebook.com", "twitter.com", "x.com", "instagram.com",
    "youtube.com", "crunchbase.com", "glassdoor.com", "indeed.com", "duckduckgo.com",
    "google.com", "wikipedia.org", "pinterest.com",
)
BLOCKED_EMAIL_HINTS = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", "example.com", "sentry",
    "wixpress", "yoursite", "your@site", "domain.com", "email.com", "site.com",
    ".css", ".js",
)


def _plausible_email(text: str) -> bool:
    low = text.lower()
    return not any(h in low for h in BLOCKED_EMAIL_HINTS)


def _plausible_phone(raw: str) -> bool:
    # Periods are only plausible as 3-3-4 group separators (e.g. "555.123.4567").
    # A single dot or ratio-like value (e.g. "0.6972240154") is junk.
    if "/" in raw or ":" in raw or raw.count(".") == 1:
        return False
    if "(" in raw and ")" not in raw:
        return False
    digits = re.sub(r"\D", "", raw)
    # Skip timestamps / serials / iso dates that match the digit-length shape.
    if not (7 <= len(digits) <= 15):
        return False
    if len(digits) >= 13 and digits.startswith(("155", "166", "178", "0031", "0091")):
        return False
    if len(digits) == 12 and digits.startswith("0031"):
        return False
    if len(digits) == 10 and digits.startswith("1"):
        return False
    return True


async def _find_company_contacts(company: str) -> Dict[str, Any]:
    """Best-effort lookup of a company's website + public contact details.

    Searches DuckDuckGo (no API key) for the company site, then crawls the
    homepage + common contact/about pages for emails and phone numbers.
    Returns only what it finds; empty strings/lists otherwise.
    """
    result: Dict[str, Any] = {"website": "", "email": "", "phones": []}
    if not company:
        return result
    try:
        async with httpx.AsyncClient(timeout=15, headers=UA, follow_redirects=True) as hc:
            r = await hc.get("https://html.duckduckgo.com/html/", params={"q": f"{company} official website"})
            if r.status_code != 200:
                return result
            links = re.findall(r'result__a[^>]*href="([^"]+)"', r.text)
            domains = []
            for l in links:
                m = re.match(r"//duckduckgo\.com/l/\?uddg=([^&]+)", l)
                url = m.group(1) if m else l
                try:
                    from urllib.parse import unquote, urlparse
                    url = unquote(url)
                    host = urlparse(url).netloc.lower().lstrip("www.")
                except Exception:
                    continue
                if host and host not in COMPANY_BLOCK_HOSTS and not any(b in url for b in COMPANY_BLOCK_HOSTS):
                    domains.append(url)
            if not domains:
                return result
            result["website"] = domains[0]

            emails, phones = set(), set()
            for base in domains[:3]:
                base = base.rstrip("/")
                for path in ("", "/contact", "/contact-us", "/contactus", "/about", "/about-us"):
                    try:
                        rr = await hc.get(base + path)
                        if rr.status_code != 200:
                            continue
                        txt = re.sub(r"<[^>]+>", " ", rr.text)
                        for e in re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", txt):
                            if _plausible_email(e):
                                emails.add(e.lower())
                        for ph in re.findall(PHONE_RE, txt):
                            if _plausible_phone(ph):
                                phones.add(re.sub(r"\s+", " ", ph).strip())
                    except Exception:
                        continue
            # Prefer generic contact@/info@ addresses; fall back to any.
            order = lambda e: (0 if e.lower().startswith(("contact@", "info@", "hello@", "sales@")) else 1, e)
            if emails:
                result["email"] = sorted(emails, key=order)[0]
            result["phones"] = sorted(phones)[:3]
            return result
    except Exception as exc:
        logger.error("Company contact lookup failed | company=%s error=%s", company, exc)
        return result


# ─── Source: RemoteOK ─────────────────────────────────────────────────────────

async def fetch_remoteok(query: str, limit: int = 25) -> List[Dict[str, Any]]:
    """Fetch remote dev jobs from RemoteOK (free API, no key)."""
    try:
        async with httpx.AsyncClient(timeout=20, headers=UA) as hc:
            r = await hc.get("https://remoteok.com/api")
            r.raise_for_status()
        data = r.json()
        if not isinstance(data, list) or len(data) < 2:
            return []
        jobs = data[1:]  # first element is a metadata object
        out = []
        keywords = [query] if query and query not in ("any", "all", "") else DEFAULT_KEYWORDS
        for j in jobs:
            text = " ".join([
                j.get("position", ""), j.get("company", ""),
                j.get("description", ""), " ".join(j.get("tags", [])),
            ])
            if not _matches(text, keywords):
                continue
            out.append(_project(
                title=j.get("position", "Untitled"),
                company=j.get("company", ""),
                description=j.get("description", ""),
                platform="remoteok",
                platform_url=j.get("url") or j.get("apply_url") or "",
                location=j.get("location", "Remote"),
                salary=f"{j.get('salary_min', '')}-{j.get('salary_max', '')}".strip("-"),
                skills=j.get("tags", []),
                source_id=str(j.get("id", j.get("slug", ""))),
                posted_at=j.get("date", ""),
            ))
            if len(out) >= limit:
                break
        logger.info("RemoteOK fetch | query=%s returned=%d", query, len(out))
        return out
    except Exception as exc:
        logger.error("RemoteOK fetch failed | query=%s error=%s", query, exc)
        return []


# ─── Source: Remotive ─────────────────────────────────────────────────────────

async def fetch_remotive(query: str, limit: int = 25) -> List[Dict[str, Any]]:
    """Fetch remote jobs from Remotive (free API, no key)."""
    try:
        async with httpx.AsyncClient(timeout=20, headers=UA) as hc:
            r = await hc.get("https://remotive.com/api/remote-jobs")
            r.raise_for_status()
        jobs = r.json().get("jobs", [])
        out = []
        keywords = [query] if query and query not in ("any", "all", "") else DEFAULT_KEYWORDS
        for j in jobs:
            text = " ".join([
                j.get("title", ""), j.get("company_name", ""),
                j.get("description", ""), " ".join(j.get("tags", [])),
            ])
            if not _matches(text, keywords):
                continue
            out.append(_project(
                title=j.get("title", "Untitled"),
                company=j.get("company_name", ""),
                description=j.get("description", ""),
                platform="remotive",
                platform_url=j.get("url", ""),
                location=j.get("candidate_required_location", "Remote"),
                salary=j.get("salary", ""),
                skills=j.get("tags", []),
                source_id=str(j.get("id", "")),
                posted_at=j.get("publication_date", ""),
            ))
            if len(out) >= limit:
                break
        logger.info("Remotive fetch | query=%s returned=%d", query, len(out))
        return out
    except Exception as exc:
        logger.error("Remotive fetch failed | query=%s error=%s", query, exc)
        return []


# ─── Source: WeWorkRemotely (RSS) ─────────────────────────────────────────────

async def fetch_weworkremotely(query: str, limit: int = 25) -> List[Dict[str, Any]]:
    """Fetch remote programming jobs from WeWorkRemotely RSS feed."""
    try:
        async with httpx.AsyncClient(timeout=20, headers=UA) as hc:
            r = await hc.get(
                "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss"
            )
            r.raise_for_status()
        root = ET.fromstring(r.text)
        out = []
        keywords = [query] if query and query not in ("any", "all", "") else DEFAULT_KEYWORDS
        for it in root.iter("item"):
            title = it.findtext("title") or ""
            link = it.findtext("link") or ""
            desc = it.findtext("description") or ""
            company = ""
            m = re.match(r"^(.*?):\s*", title)
            if m:
                company = m.group(1).strip()
            if not _matches(f"{title} {desc}", keywords):
                continue
            out.append(_project(
                title=title,
                company=company,
                description=desc,
                platform="weworkremotely",
                platform_url=link,
                location="Remote",
                salary="",
                skills=[],
                source_id=link,
                posted_at="",
            ))
            if len(out) >= limit:
                break
        logger.info("WeWorkRemotely fetch | query=%s returned=%d", query, len(out))
        return out
    except Exception as exc:
        logger.error("WeWorkRemotely fetch failed | query=%s error=%s", query, exc)
        return []


# ─── Source: LinkedIn (guest job search) ──────────────────────────────────────

LINKEDIN_SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
LINKEDIN_JOB_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"

LINKEDIN_TPR = {
    1: "r86400",      # past 24 hours
    7: "r604800",     # past 7 days
    15: "r1296000",   # past 15 days
    30: "r2592000",   # past 30 days
}


def _parse_linkedin_cards(html: str) -> List[Dict[str, str]]:
    """Parse LinkedIn guest search result cards into raw dicts."""
    out = []
    for block in re.split(r"<li>", html):
        m_id = re.search(r'data-entity-urn="urn:li:jobPosting:(\d+)"', block)
        if not m_id:
            continue
        job_id = m_id.group(1)
        m_title = re.search(r'<h3 class="base-search-card__title">\s*(.*?)\s*</h3>', block, re.S)
        m_company = re.search(
            r'class="hidden-nested-link"[^>]*>\s*(.*?)\s*</a>', block, re.S
        )
        m_loc = re.search(r'class="job-search-card__location">\s*(.*?)\s*</span>', block, re.S)
        m_date = re.search(r'<time[^>]*datetime="([^"]+)"', block)
        m_link = re.search(r'base-card__full-link[^>]*href="([^"]+)"', block)
        title = re.sub(r"\s+", " ", m_title.group(1)).strip() if m_title else "Untitled"
        company = re.sub(r"\s+", " ", m_company.group(1)).strip() if m_company else ""
        location = re.sub(r"\s+", " ", m_loc.group(1)).strip() if m_loc else ""
        link = (m_link.group(1) if m_link else "").replace("&amp;", "&")
        out.append({
            "job_id": job_id,
            "title": title,
            "company": company,
            "location": location,
            "posted_at": m_date.group(1) if m_date else "",
            "link": link,
        })
    return out


def _clean_linkedin_description(html: str) -> str:
    """Extract the show-more-less description block and strip markup."""
    m = re.search(r'class="show-more-less-html__markup[^>]*">(.*?)</div>', html, re.S)
    seg = m.group(1) if m else ""
    seg = re.sub(r"<br\s*/?>", "\n", seg)
    seg = re.sub(r"</p>", "\n\n", seg, flags=re.I)
    seg = re.sub(r"</li>", "\n", seg, flags=re.I)
    seg = re.sub(r"<li[^>]*>", "\n• ", seg, flags=re.I)
    seg = re.sub(r"<[^>]+>", " ", seg)
    seg = re.sub(r"&nbsp;", " ", seg)
    seg = re.sub(r"&amp;", "&", seg)
    seg = re.sub(r"&lt;", "<", seg)
    seg = re.sub(r"&gt;", ">", seg)
    seg = re.sub(r"&quot;", '"', seg)
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in seg.split("\n")]
    seg = "\n".join(ln for ln in lines if ln)
    seg = re.sub(r"\n{3,}", "\n\n", seg)
    return seg.strip()


async def fetch_linkedin(query: str, limit: int = 25, days: int = 30) -> List[Dict[str, Any]]:
    """
    Fetch freelance/contract jobs from LinkedIn's guest job search.

    Uses the public guest endpoint (no login) with ``f_JT=C`` to prefer
    contract roles and ``f_TPR`` to restrict results to the last ``days``.
    Each search card is enriched with the full job description from the
    per-posting guest page. If LinkedIn blocks/redirects, returns [].
    """
    try:
        search_params = {
            "keywords": query or "freelance developer",
            "location": "",
            "geoId": "",
            "f_JT": "C",  # Contract jobs
            "position": "1",
            "pageNum": "0",
            "start": "0",
        }
        tpr = LINKEDIN_TPR.get(int(days or 30))
        if tpr:
            search_params["f_TPR"] = tpr
        async with httpx.AsyncClient(timeout=20, headers=UA, follow_redirects=True) as hc:
            r = await hc.get(LINKEDIN_SEARCH_URL, params=search_params)
            r.raise_for_status()
            cards = _parse_linkedin_cards(r.text)
            out = []
            keywords = [query] if query and query not in ("any", "all", "") else DEFAULT_KEYWORDS
            for card in cards:
                text = " ".join([card["title"], card["company"], card["location"]])
                if not _matches(text, keywords):
                    continue
                try:
                    d = await hc.get(LINKEDIN_JOB_URL.format(job_id=card["job_id"]))
                    detail = d.text if d.status_code == 200 else ""
                except Exception:
                    detail = ""
                description = _clean_linkedin_description(detail)
                salary = ""
                m_sal = re.search(r'<span class="compensation__salary[^"]*">\s*(.*?)\s*</span>', detail, re.S)
                if m_sal:
                    salary = re.sub(r"\s+", " ", m_sal.group(1)).strip()
                if not _matches(f"{text} {description}", keywords):
                    continue
                out.append(_project(
                    title=card["title"],
                    company=card["company"],
                    description=description or f"{card['title']} at {card['company']}",
                    platform="linkedin",
                    platform_url=card["link"],
                    location=card["location"] or "Remote",
                    salary=salary,
                    skills=[],
                    source_id=card["job_id"],
                    posted_at=card["posted_at"],
                ))
                if len(out) >= limit:
                    break
            logger.info("LinkedIn fetch | query=%s returned=%d", query, len(out))
            return out
    except Exception as exc:
        logger.error("LinkedIn fetch failed | query=%s error=%s", query, exc)
        return []


# ─── Orchestrator ─────────────────────────────────────────────────────────────

SOURCES = {
    "remoteok": fetch_remoteok,
    "remotive": fetch_remotive,
    "weworkremotely": fetch_weworkremotely,
    "linkedin": fetch_linkedin,
}


async def fetch_freelance_projects(
    query: str = "",
    source: str = "all",
    limit: int = 25,
    days: int = 30,
) -> Dict[str, Any]:
    """
    Fetch freelance/remote projects from the enabled sources.

    Args:
        query:  Keyword filter (e.g. "devops", "wordpress"). Empty = defaults.
        source: One of "all", "remoteok", "remotive", "weworkremotely", "linkedin".
        limit:  Max projects per source.
        days:   Recency window (LinkedIn f_TPR); 1/7/15/30.

    Returns:
        Dict with ``projects`` list and ``results_per_source`` summary.
    """
    sources_to_run = (
        list(SOURCES.keys()) if source == "all" else [source]
    )
    results_per_source: Dict[str, int] = {}
    projects: List[Dict[str, Any]] = []
    for name in sources_to_run:
        fn = SOURCES.get(name)
        if not fn:
            continue
        if name == "linkedin":
            items = await fn(query, limit, days=days)
        else:
            items = await fn(query, limit)
        results_per_source[name] = len(items)
        projects.extend(items)
    logger.info(
        "Freelance fetch complete | query=%s source=%s per_source=%s total=%d",
        query, source, results_per_source, len(projects),
    )
    return {"projects": projects, "results_per_source": results_per_source}
