"""
Lead search helpers: Google Maps Places API + fallback mock data.

Functionality:
  - get_api_key(): reads from env → db settings → None (triggers mock mode).
  - fetch_places(): calls Google Places API v1 (text search).
  - run_search(): orchestrates fetch, email discovery, and DB upsert.

Logging:
  - Every search logs total_found, new_saved, hot_leads, and mock mode.
  - Failed fetches and email discovery errors are logged with context.
"""
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from database import db
from discovery import scrape_emails
from utils.constants import MOCK_RESULTS
from utils.logger import get_logger

logger = get_logger(__name__)


WEB_QUERY_SITES = [
    "site:google.com",
    "site:facebook.com",
    "site:instagram.com",
    "site:linkedin.com/company",
    "site:yelp.com",
]

SOCIAL_DOMAINS = ("linkedin.com", "facebook.com", "instagram.com", "x.com")
REVIEW_DOMAINS = ("yelp.com", "tripadvisor.com", "trustpilot.com", "clutch.co")
JOB_DOMAINS = ("greenhouse.io", "lever.co", "workable.com", "ashbyhq.com", "jobs.lever.co")

DIRECTORY_QUERIES = [
    "site:yelp.com/biz",
    "site:yellowpages.com/profile",
    "site:foursquare.com/v",
    "site:mapquest.com/us",
]


# ─── API Key Resolution ───────────────────────────────────────────────────────

async def get_api_key() -> Optional[str]:
    """
    Resolve the Google Maps API key.

    Priority:
      1. ``GOOGLE_MAPS_API_KEY`` environment variable.
      2. ``google_maps_api_key`` setting stored in MongoDB.
      3. Returns ``None`` → mock mode activated.
    """
    env_key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
    if env_key:
        return env_key

    setting = await db.settings.find_one({"key": "google_maps_api_key"})
    if setting and setting.get("value"):
        return setting["value"]

    return None


# ─── Google Maps Geocoding ────────────────────────────────────────────────────

async def geocode_location(api_key: str, location: str) -> Optional[Dict[str, float]]:
    """
    Geocode a human-readable location string to lat/lng coordinates.

    Args:
        api_key:  Google Maps API key.
        location: Human-readable address or city name.

    Returns:
        Dict ``{"lat": ..., "lng": ...}`` or ``None`` if geocoding fails.
    """
    async with httpx.AsyncClient(timeout=15.0) as hc:
        response = await hc.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": location, "key": api_key},
        )
        data = response.json()
        if data.get("status") == "OK" and data.get("results"):
            loc = data["results"][0]["geometry"]["location"]
            return {"lat": loc["lat"], "lng": loc["lng"]}

    logger.warning("Geocoding returned no results | location=%s", location)
    return None


# ─── Google Places Text Search ────────────────────────────────────────────────

async def fetch_places(
    api_key: str,
    location: str,
    category: str,
    radius: int,
) -> List[Dict[str, Any]]:
    """
    Fetch local businesses from the Google Places API v1 text search.

    Args:
        api_key:   Google Maps API key.
        location:  Human-readable location string.
        category:  Business category / type.
        radius:    Search radius in metres (informational; text search uses query).

    Returns:
        List of place dicts. Empty list on API error.
    """
    async with httpx.AsyncClient(timeout=30.0) as hc:
        headers = {
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,"
                "places.nationalPhoneNumber,places.internationalPhoneNumber,"
                "places.websiteUri,places.rating,places.userRatingCount,"
                "places.types,places.location"
            ),
            "Content-Type": "application/json",
        }
        payload = {"textQuery": f"{category} in {location}", "maxResultCount": 20}

        response = await hc.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers=headers,
            json=payload,
        )

        if response.status_code != 200:
            logger.error(
                "Places API error | status=%d location=%s category=%s body=%s",
                response.status_code, location, category, response.text[:200],
            )
            return []

        results: List[Dict[str, Any]] = []
        for place in response.json().get("places", []):
            results.append({
                "place_id": place.get("id"),
                "name": (place.get("displayName") or {}).get("text", "Unknown"),
                "address": place.get("formattedAddress"),
                "phone": (
                    place.get("nationalPhoneNumber")
                    or place.get("internationalPhoneNumber")
                ),
                "website": place.get("websiteUri"),
                "rating": place.get("rating"),
                "user_ratings_total": place.get("userRatingCount"),
                "types": place.get("types", []),
                "location": place.get("location"),
            })

        logger.info(
            "Places API returned %d results | location=%s category=%s",
            len(results), location, category,
        )
        return results


async def fetch_web_prospects(
    location: str,
    category: str,
    radius: int,
) -> List[Dict[str, Any]]:
    """Find businesses from the open web and enrich with public contact data."""
    query_terms = [
        f"{category} in {location}",
        f"best {category} {location}",
        f"{category} {location} contact",
    ]
    results: List[Dict[str, Any]] = []
    seen_domains: set[str] = set()

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as hc:
        for query in query_terms:
            try:
                response = await hc.get("https://html.duckduckgo.com/html/", params={"q": query})
                if response.status_code != 200:
                    continue
                links = re.findall(r'result__a[^>]*href="([^"]+)"', response.text)
                for link in links[:10]:
                    try:
                        from urllib.parse import unquote, urlparse
                        match = re.match(r"//duckduckgo\.com/l/\?uddg=([^&]+)", link)
                        url = unquote(match.group(1) if match else link)
                        parsed = urlparse(url)
                        host = parsed.netloc.lower().lstrip("www.")
                    except Exception:
                        continue
                    if not host or host in seen_domains:
                        continue
                    if any(b in host for b in ("duckduckgo.com", "google.com", "facebook.com", "linkedin.com")):
                        continue
                    seen_domains.add(host)
                    website = f"{parsed.scheme or 'https'}://{parsed.netloc}{parsed.path}".rstrip("/")
                    try:
                        scraped = await scrape_emails(website)
                    except Exception:
                        scraped = {"emails": [], "best": None, "pages_checked": 0}
                    results.append({
                        "place_id": f"web:{host}",
                        "name": host.replace(".", " ").split("/")[0].replace("-", " ").title(),
                        "address": location,
                        "phone": None,
                        "website": website,
                        "rating": None,
                        "user_ratings_total": None,
                        "types": [category, "web_prospect"],
                        "emails": scraped.get("emails") or [],
                        "best_email": scraped.get("best"),
                    })
                    if len(results) >= 20:
                        return results
            except Exception as exc:
                logger.info("Web prospect search failed | query=%s error=%s", query, exc)
                continue

    logger.info("Web prospect search returned %d results | location=%s category=%s", len(results), location, category)
    return results


async def fetch_directory_prospects(
    location: str,
    category: str,
    radius: int,
) -> List[Dict[str, Any]]:
    """Find leads from public directory search results and enrich them."""
    query_terms = [
        f"{category} {location}",
        f"{category} near {location}",
        f"best {category} in {location}",
    ]
    directory_hosts = ("yelp.com", "yellowpages.com", "foursquare.com", "mapquest.com")
    results: List[Dict[str, Any]] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as hc:
        for query in query_terms:
            try:
                response = await hc.get("https://html.duckduckgo.com/html/", params={"q": query})
                if response.status_code != 200:
                    continue
                links = re.findall(r'result__a[^>]*href="([^"]+)"', response.text)
                for link in links[:12]:
                    try:
                        from urllib.parse import unquote, urlparse
                        match = re.match(r"//duckduckgo\.com/l/\?uddg=([^&]+)", link)
                        url = unquote(match.group(1) if match else link)
                        parsed = urlparse(url)
                        host = parsed.netloc.lower().lstrip("www.")
                    except Exception:
                        continue
                    if not host or host in seen or not any(d in host for d in directory_hosts):
                        continue
                    seen.add(host)
                    website = f"{parsed.scheme or 'https'}://{parsed.netloc}{parsed.path}".rstrip("/")
                    try:
                        scraped = await scrape_emails(website)
                    except Exception:
                        scraped = {"emails": [], "best": None, "pages_checked": 0}
                    results.append({
                        "place_id": f"directory:{host}",
                        "name": host.replace(".", " ").split("/")[0].replace("-", " ").title(),
                        "address": location,
                        "phone": None,
                        "website": website,
                        "rating": None,
                        "user_ratings_total": None,
                        "types": [category, "directory_prospect"],
                        "emails": scraped.get("emails") or [],
                        "best_email": scraped.get("best"),
                    })
                    if len(results) >= 20:
                        return results
            except Exception as exc:
                logger.info("Directory prospect search failed | query=%s error=%s", query, exc)
                continue

    logger.info("Directory prospect search returned %d results | location=%s category=%s", len(results), location, category)
    return results


async def _duckduckgo_urls(query: str, limit: int = 12) -> List[str]:
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as hc:
        response = await hc.get("https://html.duckduckgo.com/html/", params={"q": query})
        if response.status_code != 200:
            return []
        links = re.findall(r'result__a[^>]*href="([^"]+)"', response.text)
        urls: List[str] = []
        for link in links[:limit]:
            try:
                from urllib.parse import unquote
                match = re.match(r"//duckduckgo\.com/l/\?uddg=([^&]+)", link)
                urls.append(unquote(match.group(1) if match else link))
            except Exception:
                continue
        return urls


def _url_to_lead(url: str, location: str, category: str, source_tag: str) -> Optional[Dict[str, Any]]:
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
    except Exception:
        return None
    host = (parsed.netloc or "").lower().lstrip("www.")
    if not host:
        return None
    return {
        "place_id": f"{source_tag}:{host}",
        "name": host.replace(".", " ").split("/")[0].replace("-", " ").title(),
        "address": location,
        "phone": None,
        "website": url,
        "rating": None,
        "user_ratings_total": None,
        "types": [category, source_tag],
    }


async def fetch_social_prospects(location: str, category: str, radius: int) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for query in [f"{category} {location}", f"best {category} {location}"]:
        try:
            urls = await _duckduckgo_urls(query, limit=12)
        except Exception:
            urls = []
        for url in urls:
            if any(d in url for d in SOCIAL_DOMAINS):
                key = url.split("?")[0]
                if key in seen:
                    continue
                seen.add(key)
                item = _url_to_lead(url, location, category, "social_prospect")
                if item:
                    results.append(item)
            if len(results) >= 20:
                return results
    logger.info("Social prospect search returned %d results | location=%s category=%s", len(results), location, category)
    return results


async def fetch_review_prospects(location: str, category: str, radius: int) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for query in [f"{category} reviews {location}", f"best {category} {location} review"]:
        try:
            urls = await _duckduckgo_urls(query, limit=12)
        except Exception:
            urls = []
        for url in urls:
            if any(d in url for d in REVIEW_DOMAINS):
                key = url.split("?")[0]
                if key in seen:
                    continue
                seen.add(key)
                item = _url_to_lead(url, location, category, "review_prospect")
                if item:
                    results.append(item)
            if len(results) >= 20:
                return results
    logger.info("Review prospect search returned %d results | location=%s category=%s", len(results), location, category)
    return results


async def fetch_job_prospects(location: str, category: str, radius: int) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for query in [f"{category} jobs {location}", f"hiring {category} {location}"]:
        try:
            urls = await _duckduckgo_urls(query, limit=15)
        except Exception:
            urls = []
        for url in urls:
            if any(d in url for d in JOB_DOMAINS):
                key = url.split("?")[0]
                if key in seen:
                    continue
                seen.add(key)
                item = _url_to_lead(url, location, category, "job_prospect")
                if item:
                    results.append(item)
            if len(results) >= 20:
                return results
    logger.info("Job prospect search returned %d results | location=%s category=%s", len(results), location, category)
    return results


# ─── Main Search Orchestrator ─────────────────────────────────────────────────

async def run_search(
    location: str,
    category: str,
    radius: int,
    user_id: str,
    source: str = "manual",
    no_website_only: bool = False,
    discovery_mode: str = "maps",
    discovery_modes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Full search pipeline: fetch → email discovery → DB upsert.

    Args:
        location:        Human-readable location string.
        category:        Business category / type.
        radius:          Search radius in metres.
        user_id:         The requesting user's UUID.
        source:          How the search was triggered (``"manual"``, ``"schedule:…"``).
        no_website_only: When True, only businesses WITHOUT a website are kept
                         (hot leads that need a website built).

    Returns:
        Dict with keys ``search``, ``results``, and ``is_mock``.
    """
    api_key = await get_api_key()
    is_mock = not api_key
    discovery_mode = (discovery_mode or "maps").strip().lower()
    discovery_modes = [m.strip().lower() for m in (discovery_modes or [discovery_mode]) if m and m.strip()]
    if not discovery_modes:
        discovery_modes = [discovery_mode]
    if "all" in discovery_modes:
        discovery_modes = ["maps", "web", "directory", "social", "reviews", "jobs"]
    discovery_modes = list(dict.fromkeys(discovery_modes))

    results = []
    source_chunks: Dict[str, List[Dict[str, Any]]] = {}

    async def _append_mode(mode: str) -> None:
        nonlocal is_mock
        try:
            if mode == "maps":
                if api_key:
                    source_chunks[mode] = await fetch_places(api_key, location, category, radius)
                    is_mock = False
                else:
                    source_chunks[mode] = []
            elif mode == "web":
                source_chunks[mode] = await fetch_web_prospects(location, category, radius)
                is_mock = False
            elif mode == "directory":
                source_chunks[mode] = await fetch_directory_prospects(location, category, radius)
                is_mock = False
            elif mode == "social":
                source_chunks[mode] = await fetch_social_prospects(location, category, radius)
                is_mock = False
            elif mode == "reviews":
                source_chunks[mode] = await fetch_review_prospects(location, category, radius)
                is_mock = False
            elif mode == "jobs":
                source_chunks[mode] = await fetch_job_prospects(location, category, radius)
                is_mock = False
            else:
                source_chunks[mode] = []
        except Exception as exc:
            logger.error("Search mode failed | mode=%s user_id=%s location=%s category=%s error=%s", mode, user_id, location, category, exc)
            source_chunks[mode] = []

    if discovery_modes == ["maps"] and is_mock:
        logger.info(
            "Search running in mock mode | user_id=%s location=%s category=%s source=%s",
            user_id, location, category, source,
        )
        source_chunks["maps"] = [
            r for r in MOCK_RESULTS
            if category.lower() in " ".join(r["types"]).lower()
            or category.lower() == "all"
        ] or MOCK_RESULTS[:5]
    else:
        for mode in discovery_modes:
            await _append_mode(mode)

    for chunk in source_chunks.values():
        results.extend(chunk)

    deduped: Dict[str, Dict[str, Any]] = {}
    for item in results:
        key = (item.get("place_id") or item.get("website") or item.get("name") or "").strip().lower()
        if not key:
            key = str(uuid.uuid4())
        deduped.setdefault(key, item)
    results = list(deduped.values())[:40]
    source_summary = {mode: len(source_chunks.get(mode, [])) for mode in discovery_modes}

    # Optional: keep only hot leads (no website)
    if no_website_only:
        results = [r for r in results if not bool(r.get("website"))]
        logger.info(
            "Filtered to no-website leads | user_id=%s kept=%d is_mock=%s",
            user_id, len(results), is_mock,
        )

    # ── Persist results ───────────────────────────────────────────────────────
    saved = 0
    hot_leads = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    for place in results:
        if not place.get("place_id"):
            place["place_id"] = str(uuid.uuid4())
        place_source = place.get("types", [])[-1] if place.get("types") else discovery_modes[0]
        has_website = bool(place.get("website"))
        if not has_website:
            hot_leads += 1

        # Email discovery for businesses with a website
        discovered_email: Optional[str] = None
        discovered_emails: List[str] = []
        if has_website and place.get("website"):
            try:
                scraped = await scrape_emails(place["website"])
                discovered_emails = scraped.get("emails") or []
                discovered_email = scraped.get("best")
            except Exception as exc:
                logger.info(
                    "Email discovery failed | website=%s error=%s",
                    place.get("website"), exc,
                )

        lead_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "place_id": place.get("place_id"),
            "name": place.get("name"),
            "address": place.get("address"),
            "phone": place.get("phone"),
            "website": place.get("website"),
            "has_website": has_website,
            "rating": place.get("rating"),
            "user_ratings_total": place.get("user_ratings_total"),
            "types": place.get("types", []),
            "category_searched": category,
            "location_searched": location,
            "status": "new",
            "notes": "",
            "source": source,
            "source_mode": place_source,
            "discovered_email": discovered_email,
            "discovered_emails": discovered_emails,
            "created_at": now_iso,
            "updated_at": now_iso,
        }

        existing = await db.leads.find_one({
            "user_id": user_id,
            "place_id": place.get("place_id"),
        })

        if not existing:
            await db.leads.insert_one(lead_doc)
            saved += 1
        else:
            update = {
                "phone": place.get("phone"),
                "website": place.get("website"),
                "has_website": has_website,
                "rating": place.get("rating"),
                "updated_at": now_iso,
            }
            if discovered_email:
                update["discovered_email"] = discovered_email
                update["discovered_emails"] = discovered_emails
            await db.leads.update_one({"_id": existing["_id"]}, {"$set": update})

    logger.info(
            "Search completed | user_id=%s location=%s category=%s "
            "total_found=%d new_saved=%d hot_leads=%d is_mock=%s source=%s mode=%s",
        user_id, location, category,
        len(results), saved, hot_leads, is_mock, source, discovery_mode,
    )

    # ── Persist search history ────────────────────────────────────────────────
    search_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "location": location,
        "category": category,
        "radius_meters": radius,
        "source": source,
        "total_found": len(results),
        "hot_leads": hot_leads,
        "new_saved": saved,
        "is_mock": is_mock,
        "discovery_mode": discovery_mode,
        "discovery_modes": discovery_modes,
        "source_summary": source_summary,
        "created_at": now_iso,
    }
    await db.search_history.insert_one(dict(search_doc))

    return {"search": search_doc, "results": results, "is_mock": is_mock, "discovery_mode": discovery_mode, "discovery_modes": discovery_modes, "source_summary": source_summary}
