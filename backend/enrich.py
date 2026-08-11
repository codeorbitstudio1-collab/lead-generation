"""
Lead enrichment via the Google Places API.

Fetches real business data (rating, recent reviews, editorial summary,
opening hours, website) so the AI can write personalized emails and call
scripts instead of generic placeholders.

If no Google Maps API key is configured (env or Settings), enrichment is
skipped silently and the caller just uses the lead fields already stored.
"""
import os
from typing import Any, Dict, List, Optional

import httpx

from database import db
from utils.logger import get_logger

logger = get_logger(__name__)

PLACES_API = "https://places.googleapis.com/v1/places"
DETAIL_FIELDS = (
    "id,displayName,formattedAddress,rating,userRatingCount,"
    "nationalPhoneNumber,websiteUri,regularOpeningHours,"
    "editorialSummary,reviews,types"
)


async def get_places_api_key() -> str:
    """Resolve the Google Maps API key from env, then DB settings."""
    env_key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
    if env_key:
        return env_key
    doc = await db.settings.find_one({"key": "google_maps_api_key"})
    return (doc or {}).get("value", "") or ""


async def find_place_id(api_key: str, name: str, location: str) -> Optional[str]:
    """
    Find a Google place id by business name + location via Places text search.

    Returns:
        Place ID string, or ``None`` if not found.
    """
    query = f"{name} {location}".strip()
    async with httpx.AsyncClient(timeout=15.0) as hc:
        resp = await hc.post(
            f"{PLACES_API}:searchText",
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "places.id,places.displayName",
                "Content-Type": "application/json",
            },
            json={"textQuery": query, "maxResultCount": 1},
        )
        if resp.status_code != 200:
            logger.info("Enrichment text search failed | status=%d query=%s", resp.status_code, query)
            return None
        places = resp.json().get("places") or []
        if not places:
            return None
        return places[0].get("id")


async def fetch_place_details(api_key: str, place_id: str) -> Dict[str, Any]:
    """Fetch detailed place data (reviews, summary, hours) by place id."""
    async with httpx.AsyncClient(timeout=15.0) as hc:
        resp = await hc.get(
            f"{PLACES_API}/{place_id}",
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": DETAIL_FIELDS,
            },
        )
        if resp.status_code != 200:
            logger.info("Enrichment details failed | status=%d place_id=%s", resp.status_code, place_id)
            return {}
        return resp.json()


def _format_hours(hours: Optional[Dict[str, Any]]) -> str:
    if not hours:
        return ""
    periods = hours.get("weekdayDescriptions") or []
    return "; ".join(str(p) for p in periods)[:300]


async def enrich_lead(lead: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build a rich context dict about a business from Google Places.

    Args:
        lead: Lead document from MongoDB (must have ``name``; may have
              ``place_id``, ``location_searched`` or ``address``).

    Returns:
        Dict with keys ``name``, ``address``, ``rating``, ``reviews_count``,
        ``phone``, ``website``, ``opening_hours``, ``editorial_summary``,
        ``review_snippets`` (list of ``{author, rating, text}``),
        ``types`` (list of category labels). Returns a minimal dict (just the
        lead fields already present) when enrichment is unavailable.
    """
    base = {
        "name": lead.get("name", ""),
        "address": lead.get("address", ""),
        "rating": lead.get("rating"),
        "reviews_count": lead.get("user_ratings_total"),
        "phone": lead.get("phone", ""),
        "website": lead.get("website", ""),
        "opening_hours": "",
        "editorial_summary": "",
        "review_snippets": [],
        "types": lead.get("types") or [],
    }

    api_key = await get_places_api_key()
    if not api_key:
        return base

    place_id = lead.get("place_id") or ""
    if not place_id:
        location = lead.get("location_searched") or lead.get("address") or ""
        if location:
            place_id = await find_place_id(api_key, lead.get("name", ""), location) or ""

    if not place_id:
        return base

    details = await fetch_place_details(api_key, place_id)
    if not details:
        return base

    snippets: List[Dict[str, str]] = []
    for review in (details.get("reviews") or [])[:3]:
        text = (review.get("text") or {}).get("text", "")
        author = ((review.get("authorAttribution") or {}) or {}).get("displayName", "")
        rating = review.get("rating")
        if text:
            snippets.append({
                "author": author or "a reviewer",
                "rating": rating if rating is not None else "",
                "text": text[:240],
            })

    enriched = {
        "name": details.get("displayName") or base["name"],
        "address": details.get("formattedAddress") or base["address"],
        "rating": details.get("rating") or base["rating"],
        "reviews_count": details.get("userRatingCount") or base["reviews_count"],
        "phone": details.get("nationalPhoneNumber") or base["phone"],
        "website": details.get("websiteUri") or base["website"],
        "opening_hours": _format_hours(details.get("regularOpeningHours")),
        "editorial_summary": ((details.get("editorialSummary") or {}) or {}).get("text", ""),
        "review_snippets": snippets,
        "types": details.get("types") or base["types"],
    }

    logger.info(
        "Lead enriched | lead=%s name=%s reviews=%d summary=%s",
        lead.get("id"), enriched["name"], len(snippets), bool(enriched["editorial_summary"]),
    )
    return enriched
