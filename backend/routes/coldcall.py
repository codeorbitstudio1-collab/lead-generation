"""
Cold-call assistant routes: prioritized call queue + per-lead AI call scripts.

All phone-based outreach is manual (click-to-dial) — no calling provider needed.
This module just makes it faster: a "call now" list and a personalized script.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, Depends

from core import api, db, get_current_user, get_setting_value
from outreach import generate_call_script, generate_proposal
from utils.logger import get_logger

logger = get_logger(__name__)


def _parse_dt(value: str):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _score_call_lead(lead: Dict[str, Any]) -> Dict[str, Any]:
    """Score how call-worthy a lead is (higher = call first)."""
    score = 0
    reasons: List[str] = []
    status = (lead.get("status") or "new").lower()

    if not lead.get("has_website"):
        score += 35
        reasons.append("No website (hot)")
    if lead.get("phone"):
        score += 15
        reasons.append("Phone available")
    if not (lead.get("discovered_email") or lead.get("email")):
        score += 10
        reasons.append("No email — call instead")

    try:
        rating = float(lead.get("rating")) if lead.get("rating") is not None else None
    except Exception:
        rating = None
    try:
        reviews = int(lead.get("user_ratings_total") or 0)
    except Exception:
        reviews = 0
    if rating is not None and rating >= 4.0 and reviews >= 10:
        score += 12
        reasons.append("Good reputation")

    if status == "new":
        score += 18
        reasons.append("Fresh lead")
    elif status == "contacted":
        score += 8
        reasons.append("Needs follow-up")
    elif status == "interested":
        score += 5
        reasons.append("Warm lead")
    elif status in {"archived", "closed", "rejected"}:
        score -= 30
        reasons.append("Low priority")

    created_at = _parse_dt(lead.get("created_at") or "")
    if created_at:
        age_days = max((datetime.now(timezone.utc) - created_at).days, 0)
        if age_days <= 7:
            score += 10
            reasons.append("Recent capture")

    try:
        contact_count = int(lead.get("contact_count") or 0)
    except Exception:
        contact_count = 0
    if contact_count == 0 and status in {"new", "contacted"}:
        score += 8
        reasons.append("Never contacted")

    return {
        "lead_id": lead.get("id"),
        "name": lead.get("name"),
        "address": lead.get("address"),
        "phone": lead.get("phone"),
        "rating": lead.get("rating"),
        "user_ratings_total": lead.get("user_ratings_total"),
        "has_website": bool(lead.get("has_website")),
        "category": lead.get("category_searched"),
        "location": lead.get("location_searched"),
        "status": status,
        "score": max(min(score, 100), 0),
        "reasons": reasons[:4],
        "last_contact": lead.get("last_contact"),
        "has_proposal": bool(lead.get("proposal_en") and lead.get("proposal_hi")),
        "has_call_script": bool(lead.get("call_script")),
    }


@api.get("/calls/queue")
async def call_queue(
    limit: int = 50,
    min_score: int = 0,
    category: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """
    Return the prioritized "call now" list.

    Only leads with a phone number are included. Sorted by call-worthy score
    (highest first). Use this to build your daily cold-call queue.
    """
    limit = max(1, min(int(limit or 50), 200))
    min_score = max(0, min(int(min_score or 0), 100))

    query: Dict[str, Any] = {
        "user_id": user["id"],
        "phone": {"$nin": [None, ""]},
    }
    if category:
        query["category_searched"] = category

    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    scored = sorted(
        (_score_call_lead(lead) for lead in leads),
        key=lambda item: (-item["score"], item["lead_id"] or ""),
    )
    scored = [s for s in scored if s["score"] >= min_score]

    summary = {
        "total_with_phone": len(scored),
        "hot": sum(1 for s in scored if s["score"] >= 70),
        "warm": sum(1 for s in scored if 40 <= s["score"] < 70),
    }
    return {"queue": scored[:limit], "summary": summary}


@api.get("/leads/{lead_id}/call-script")
async def lead_call_script(lead_id: str, user: dict = Depends(get_current_user)):
    """Generate (or regenerate) an AI cold-call script for a single lead."""
    lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not lead.get("phone"):
        raise HTTPException(status_code=400, detail="Lead has no phone number")

    result = await generate_call_script(lead)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.leads.update_one(
        {"id": lead_id, "user_id": user["id"]},
        {"$set": {"call_script": result.get("script", ""), "call_script_at": now_iso, "updated_at": now_iso}},
    )
    return {"lead_id": lead_id, "script": result.get("script", ""), "ai_error": result.get("ai_error")}


@api.post("/leads/{lead_id}/call-script/generate")
async def generate_lead_call_script(lead_id: str, user: dict = Depends(get_current_user)):
    """Generate a fresh AI call script for a lead (explicit regenerate)."""
    lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    result = await generate_call_script(lead)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.leads.update_one(
        {"id": lead_id, "user_id": user["id"]},
        {"$set": {"call_script": result.get("script", ""), "call_script_at": now_iso, "updated_at": now_iso}},
    )
    return {"lead_id": lead_id, "script": result.get("script", ""), "ai_error": result.get("ai_error")}


async def _resolve_contact(client_name: str, user: dict) -> str:
    sender = await get_setting_value("sender_name")
    return (client_name or "").strip() or sender or user.get("name") or "Web Services Team"


@api.get("/leads/{lead_id}/proposal")
async def lead_proposal(
    lead_id: str,
    client_name: str = "",
    user: dict = Depends(get_current_user),
):
    """Generate (or return the stored) bilingual EN/HI service proposal."""
    lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    stored = lead.get("proposal_en") and lead.get("proposal_hi")
    if stored:
        return {
            "lead_id": lead_id,
            "proposal_en": lead["proposal_en"],
            "proposal_hi": lead["proposal_hi"],
            "generated_at": lead.get("proposal_at"),
            "cached": True,
        }

    contact = await _resolve_contact(client_name, user)
    result = await generate_proposal(lead, contact)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.leads.update_one(
        {"id": lead_id, "user_id": user["id"]},
        {
            "$set": {
                "proposal_en": result.get("proposal_en", ""),
                "proposal_hi": result.get("proposal_hi", ""),
                "proposal_at": now_iso,
                "updated_at": now_iso,
            }
        },
    )
    return {
        "lead_id": lead_id,
        "proposal_en": result.get("proposal_en", ""),
        "proposal_hi": result.get("proposal_hi", ""),
        "generated_at": now_iso,
        "cached": False,
        "ai_error": result.get("ai_error"),
    }


@api.post("/leads/{lead_id}/proposal/generate")
async def regenerate_lead_proposal(
    lead_id: str,
    client_name: str = "",
    user: dict = Depends(get_current_user),
):
    """Regenerate a fresh bilingual proposal, overwriting any cached copy."""
    lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    contact = await _resolve_contact(client_name, user)
    result = await generate_proposal(lead, contact)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.leads.update_one(
        {"id": lead_id, "user_id": user["id"]},
        {
            "$set": {
                "proposal_en": result.get("proposal_en", ""),
                "proposal_hi": result.get("proposal_hi", ""),
                "proposal_at": now_iso,
                "updated_at": now_iso,
            }
        },
    )
    return {
        "lead_id": lead_id,
        "proposal_en": result.get("proposal_en", ""),
        "proposal_hi": result.get("proposal_hi", ""),
        "generated_at": now_iso,
        "cached": False,
        "ai_error": result.get("ai_error"),
    }