from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
import os

import csv
import io
import uuid

from fastapi import HTTPException, Depends
from fastapi.responses import StreamingResponse

from core import (
    api,
    db,
    scheduler,
    hash_password,
    verify_password,
    create_token,
    get_current_user,
    get_setting_value,
    run_search,
    register_job,
    BUSINESS_CATEGORIES,
    RegisterIn,
    LoginIn,
    SearchIn,
    SetupPlannerIn,
    LeadUpdate,
    ClientCreateIn,
    ClientUpdateIn,
    ClientPaymentIn,
    ClientMeetingIn,
    ScheduleIn,
    ScheduleUpdate,
    SettingsIn,
    BulkLeadIn,
    ManualLeadIn,
    LeadContactIn,
)


from utils.logger import get_logger, mask_secret

logger = get_logger(__name__)



# ==================== Auth Endpoints ====================

@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        logger.warning("Registration failed | reason=email_exists | email=%s", mask_secret(email, 3))
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": email,
        "name": body.name or email.split("@")[0],
        "password_hash": hash_password(body.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = create_token(user_id, email)
    logger.info("User registered successfully | user_id=%s email=%s", user_id, mask_secret(email, 3))
    return {"token": token, "user": {"id": user_id, "email": email, "name": user["name"], "role": "user"}}

@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        logger.warning("Login failed | reason=invalid_credentials | email=%s", mask_secret(email, 3))
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"], email)
    logger.info("User logged in successfully | user_id=%s", user["id"])
    return {"token": token, "user": {"id": user["id"], "email": email, "name": user.get("name"), "role": user.get("role", "user")}}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ==================== Search & Leads ====================

@api.get("/categories")
async def categories():
    return {"categories": BUSINESS_CATEGORIES}

@api.post("/search")
async def search(body: SearchIn, user: dict = Depends(get_current_user)):
    modes = body.discovery_modes or [body.discovery_mode]
    result = await run_search(
        body.location, body.category, body.radius_meters, user["id"],
        source="manual", no_website_only=body.no_website_only, discovery_mode=body.discovery_mode,
        discovery_modes=modes,
    )
    return result


@api.post("/setup/planner")
async def setup_planner(body: SetupPlannerIn, user: dict = Depends(get_current_user)):
    service = body.service.strip()
    location = body.location.strip()
    business_name = body.business_name.strip()
    goal = (body.goal or "find leads").strip()
    target_customer = (body.target_customer or "").strip()
    channels = [c.strip().lower() for c in (body.channels or ["google_maps", "email", "linkedin"]) if c and c.strip()]
    channels = [c for c in channels if c]
    if not channels:
        channels = ["google_maps", "email", "linkedin"]

    category = service.lower().replace(" ", "_")
    lead_query = {
        "location": location,
        "category": category,
        "radius_meters": 5000,
        "no_website_only": True,
    }

    prospecting_angle = f"{service} providers in {location}"
    if target_customer:
        prospecting_angle = f"{target_customer} who need {service} in {location}"

    outreach_subject = f"Quick idea for {business_name}"
    outreach_body = (
        f"Hi, I help {service} businesses in {location} turn local visibility into qualified leads. "
        f"I noticed your offer around {goal} and built a short plan to reach the right prospects. "
        f"If helpful, I can send a few lead examples and an outreach draft."
    )

    checklist = [
        f"Search Google Maps for {service} businesses in {location}.",
        "Filter for businesses without a website first.",
        "Save the hottest prospects into Leads and mark them for outreach.",
        "Create 2-3 email templates for the main offer and a follow-up.",
        "Set a daily schedule for the target location and category.",
    ]
    if target_customer:
        checklist.insert(1, f"Prioritize prospects matching: {target_customer}.")
    if body.monthly_budget:
        checklist.append(f"Budget note: keep outreach tools under {float(body.monthly_budget):.2f} per month.")

    timeline_days = body.timeline_days
    phases = [
        {"day_range": "1-3", "focus": "Setup", "tasks": ["Define category, target area, and offer.", "Prepare lead filters and templates."]},
        {"day_range": "4-10", "focus": "Prospecting", "tasks": ["Run the first search.", "Save hot leads and validate contact details."]},
        {"day_range": "11-20", "focus": "Outreach", "tasks": ["Send the first campaign.", "Track replies and update lead status."]},
        {"day_range": f"21-{timeline_days}", "focus": "Optimization", "tasks": ["Review replies and conversions.", "Refine copy, categories, and location radius."]},
    ]

    return {
        "business_name": business_name,
        "service": service,
        "location": location,
        "goal": goal,
        "target_customer": target_customer,
        "channels": channels,
        "lead_query": lead_query,
        "prospecting_angle": prospecting_angle,
        "outreach": {"subject": outreach_subject, "body": outreach_body},
        "checklist": checklist,
        "phases": phases,
    }

@api.get("/leads")
async def list_leads(
    status: Optional[str] = None,
    has_website: Optional[bool] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: Dict[str, Any] = {"user_id": user["id"]}
    if status:
        query["status"] = status
    if has_website is not None:
        query["has_website"] = has_website
    if category:
        query["category_searched"] = category
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"address": {"$regex": q, "$options": "i"}},
        ]
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"leads": leads, "total": len(leads)}


@api.get("/leads/priorities")
async def lead_priorities(limit: int = 10, user: dict = Depends(get_current_user)):
    limit = max(1, min(int(limit or 10), 50))
    leads = await db.leads.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    prioritized = sorted((_score_lead(lead) for lead in leads), key=lambda item: (-item["score"], item["lead_id"] or ""))
    summary = {
        "total": len(prioritized),
        "hot": sum(1 for item in prioritized if item["score"] >= 70),
        "warm": sum(1 for item in prioritized if 40 <= item["score"] < 70),
        "cool": sum(1 for item in prioritized if item["score"] < 40),
    }
    return {"priorities": prioritized[:limit], "summary": summary}

@api.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate, user: dict = Depends(get_current_user)):
    update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.status is not None:
        update["status"] = body.status
    if body.notes is not None:
        update["notes"] = body.notes
    if body.email is not None:
        email = body.email.strip()
        update["email"] = email
        update["discovered_email"] = email
        update["discovered_emails"] = [email] if email else []
    result = await db.leads.update_one({"id": lead_id, "user_id": user["id"]}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if lead:
        await _sync_client_from_lead(lead, user["id"])
    return lead


# ==================== Lead Contact History ====================

async def record_contact(
    lead_id: str,
    user_id: str,
    channel: str,
    direction: str = "outbound",
    status: Optional[str] = None,
    summary: Optional[str] = None,
    notes: Optional[str] = None,
    occurred_at: Optional[str] = None,
    auto_status: bool = True,
) -> Dict[str, Any]:
    """Log a contact interaction (email/call/sms) against a lead.

    Inserts into the ``lead_contacts`` collection and denormalises the latest
    entry onto the lead document as ``last_contact`` (plus ``contact_count``) so
    the leads table can show it without an extra join.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    at = (occurred_at or "").strip() or now_iso
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "lead_id": lead_id,
        "channel": channel,
        "direction": direction,
        "status": (status or "").strip() or None,
        "summary": (summary or "").strip() or None,
        "notes": (notes or "").strip() or None,
        "occurred_at": at,
        "created_at": now_iso,
    }
    await db.lead_contacts.insert_one(dict(doc))
    doc.pop("_id", None)

    lead_update: Dict[str, Any] = {
        "last_contact": {
            "channel": channel,
            "direction": direction,
            "status": doc["status"],
            "summary": doc["summary"],
            "at": at,
        },
        "updated_at": now_iso,
    }
    if auto_status:
        lead = await db.leads.find_one({"id": lead_id, "user_id": user_id}, {"status": 1})
        if lead and lead.get("status") == "new" and direction == "outbound":
            lead_update["status"] = "contacted"
    await db.leads.update_one(
        {"id": lead_id, "user_id": user_id},
        {"$set": lead_update, "$inc": {"contact_count": 1}},
    )
    return doc


@api.post("/leads/{lead_id}/contacts")
async def add_lead_contact(lead_id: str, body: LeadContactIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    doc = await record_contact(
        lead_id,
        user["id"],
        body.channel,
        body.direction,
        body.status,
        body.summary,
        body.notes,
        body.occurred_at,
    )
    return doc


@api.get("/leads/{lead_id}/contacts")
async def list_lead_contacts(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id, "user_id": user["id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    items = await db.lead_contacts.find(
        {"lead_id": lead_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("occurred_at", -1).to_list(200)
    return {"contacts": items}


@api.delete("/leads/{lead_id}/contacts/{contact_id}")
async def delete_lead_contact(lead_id: str, contact_id: str, user: dict = Depends(get_current_user)):
    result = await db.lead_contacts.delete_one(
        {"id": contact_id, "lead_id": lead_id, "user_id": user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    remaining = await db.lead_contacts.find(
        {"lead_id": lead_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("occurred_at", -1).to_list(1)
    if remaining:
        c = remaining[0]
        last = {
            "channel": c["channel"],
            "direction": c["direction"],
            "status": c.get("status"),
            "summary": c.get("summary"),
            "at": c.get("occurred_at"),
        }
    else:
        last = None
    await db.leads.update_one(
        {"id": lead_id, "user_id": user["id"]},
        {"$set": {"last_contact": last}, "$inc": {"contact_count": -1}},
    )
    return {"ok": True}

@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(get_current_user)):
    result = await db.leads.delete_one({"id": lead_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"ok": True}


@api.post("/leads")
async def create_lead(body: ManualLeadIn, user: dict = Depends(get_current_user)):
    now_iso = datetime.now(timezone.utc).isoformat()
    rating = None
    if body.rating is not None:
        try:
            rating = float(body.rating)
        except Exception:
            rating = None
    reviews_total = None
    if body.user_ratings_total is not None:
        try:
            reviews_total = int(body.user_ratings_total)
        except Exception:
            reviews_total = None
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "place_id": None,
        "name": body.name.strip(),
        "address": (body.address or "").strip(),
        "phone": (body.phone or "").strip(),
        "website": (body.website or "").strip() or None,
        "email": (body.email or "").strip() or None,
        "discovered_email": (body.email or "").strip() or None,
        "discovered_emails": [body.email.strip()] if body.email and body.email.strip() else [],
        "has_website": body.has_website if body.has_website is not None else bool((body.website or "").strip()),
        "rating": rating,
        "user_ratings_total": reviews_total,
        "types": [],
        "category_searched": (body.category_searched or "manual").strip(),
        "location_searched": (body.location_searched or "manual").strip(),
        "source": (body.source or "manual").strip() or "manual",
        "status": body.status or "new",
        "notes": (body.notes or "").strip(),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.leads.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc

@api.get("/leads/export")
async def export_leads(user: dict = Depends(get_current_user)):
    leads = await db.leads.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
    buf = io.StringIO()
    if leads:
        fields = ["name", "address", "phone", "website", "has_website", "rating", "user_ratings_total", "category_searched", "location_searched", "status", "notes", "created_at"]
        writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for l in leads:
            writer.writerow(l)
    else:
        buf.write("No leads yet.\n")
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"},
    )


# ==================== Client Contracts ====================

def _money(value):
    try:
        return round(float(value or 0), 2)
    except Exception:
        return 0.0


def _parse_iso_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _parse_date_only(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except Exception:
            return None


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _score_lead(lead: Dict[str, Any]) -> Dict[str, Any]:
    score = 0
    reasons = []
    status = (lead.get("status") or "new").lower()

    if not lead.get("has_website"):
        score += 30
        reasons.append("No website")
    if not (lead.get("discovered_email") or lead.get("email")):
        score += 20
        reasons.append("No email yet")
    if lead.get("phone"):
        score += 8
        reasons.append("Phone available")

    try:
        rating_value = float(lead.get("rating")) if lead.get("rating") is not None else None
    except Exception:
        rating_value = None
    try:
        reviews = int(lead.get("user_ratings_total") or 0)
    except Exception:
        reviews = 0
    if rating_value is not None and rating_value >= 4.0 and reviews >= 10:
        score += 10
        reasons.append("Good review profile")

    if status == "new":
        score += 15
        reasons.append("Fresh lead")
    elif status == "contacted":
        score += 10
        reasons.append("Needs follow-up")
    elif status == "interested":
        score += 5
        reasons.append("Warm lead")
    elif status in {"archived", "closed", "rejected"}:
        score -= 25
        reasons.append("Low priority status")

    created_at = _parse_dt(lead.get("created_at") or "")
    if created_at:
        age_days = max((datetime.now(timezone.utc) - created_at).days, 0)
        if age_days <= 7:
            score += 12
            reasons.append("Recent capture")
        elif age_days > 30:
            score -= 5

    try:
        contact_count = int(lead.get("contact_count") or 0)
    except Exception:
        contact_count = 0
    if contact_count == 0 and status in {"new", "contacted"}:
        score += 8
        reasons.append("No outreach logged")
    elif contact_count >= 3:
        score -= 5

    next_action = "Review manually"
    if not lead.get("has_website"):
        next_action = "Find email and send first outreach"
    elif not (lead.get("discovered_email") or lead.get("email")):
        next_action = "Run email discovery"
    elif status == "new":
        next_action = "Mark contacted and send first message"
    elif status == "contacted":
        next_action = "Follow up with a short reply"
    elif status == "interested":
        next_action = "Move to converted or book a call"
    elif status in {"closed", "archived", "rejected"}:
        next_action = "Keep archived"

    return {
        "lead_id": lead.get("id"),
        "name": lead.get("name"),
        "address": lead.get("address"),
        "phone": lead.get("phone"),
        "email": lead.get("discovered_email") or lead.get("email"),
        "website": lead.get("website"),
        "status": status,
        "category": lead.get("category_searched"),
        "location": lead.get("location_searched"),
        "score": max(min(score, 100), 0),
        "reasons": reasons[:4],
        "next_action": next_action,
        "has_website": bool(lead.get("has_website")),
        "has_email": bool(lead.get("discovered_email") or lead.get("email")),
    }


async def _sync_client_from_lead(lead: Dict[str, Any], user_id: str):
    if not lead or lead.get("status") != "converted":
        return None
    now_iso = datetime.now(timezone.utc).isoformat()
    existing = await db.clients.find_one({"lead_id": lead["id"], "user_id": user_id})
    payload = {
        "lead_id": lead["id"],
        "user_id": user_id,
        "business_name": lead.get("name") or "Unnamed Client",
        "contact_name": lead.get("name") or "",
        "status": "onboarding",
        "notes": lead.get("notes") or "",
        "requirements": lead.get("requirements") or "",
        "delivered_url": lead.get("delivered_url") or "",
        "delivery_notes": lead.get("delivery_notes") or "",
        "cost_amount": lead.get("cost_amount") or 0,
        "due_date": lead.get("due_date") or "",
        "contract_start_date": lead.get("contract_start_date") or "",
        "contract_end_date": lead.get("contract_end_date") or "",
        "onboarding_notes": lead.get("onboarding_notes") or "",
        "meetings_summary": lead.get("meetings_summary") or "",
        "confirmed_deal_amount": lead.get("confirmed_deal_amount") or 0,
        "updated_at": now_iso,
    }
    if existing:
        update = {
            "business_name": payload["business_name"],
            "contact_name": payload["contact_name"],
            "status": "onboarding",
            "notes": payload["notes"],
            "requirements": payload["requirements"],
            "delivered_url": payload["delivered_url"],
            "delivery_notes": payload["delivery_notes"],
            "cost_amount": payload["cost_amount"],
            "due_date": payload["due_date"],
            "contract_start_date": payload["contract_start_date"],
            "contract_end_date": payload["contract_end_date"],
            "onboarding_notes": payload["onboarding_notes"],
            "meetings_summary": payload["meetings_summary"],
            "confirmed_deal_amount": payload["confirmed_deal_amount"],
            "updated_at": now_iso,
        }
        await db.clients.update_one({"id": existing["id"], "user_id": user_id}, {"$set": update})
        return await db.clients.find_one({"id": existing["id"]}, {"_id": 0})
    doc = {
        "id": str(uuid.uuid4()),
        **payload,
        "lead_id": lead["id"],
        "contract_amount": 0.0,
        "advance_paid": 0.0,
        "amount_paid": 0.0,
        "balance_due": 0.0,
        "total_gained": 0.0,
        "payments": [],
        "meetings": [],
        "created_at": now_iso,
    }
    await db.clients.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.get("/clients")
async def list_clients(user: dict = Depends(get_current_user)):
    items = await db.clients.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"clients": items}


@api.post("/clients")
async def create_client(body: ClientCreateIn, user: dict = Depends(get_current_user)):
    now_iso = datetime.now(timezone.utc).isoformat()
    contract_amount = _money(body.contract_amount)
    advance_paid = min(_money(body.advance_paid), contract_amount)
    payments = []
    if advance_paid > 0:
        payments.append({"id": str(uuid.uuid4()), "amount": advance_paid, "paid_at": now_iso, "note": "Advance paid", "kind": "advance"})
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "lead_id": body.lead_id,
        "business_name": body.business_name.strip(),
        "contact_name": (body.contact_name or "").strip(),
        "contract_amount": contract_amount,
        "advance_paid": advance_paid,
        "amount_paid": advance_paid,
        "balance_due": round(contract_amount - advance_paid, 2),
        "total_gained": advance_paid,
        "status": body.status or "active",
        "notes": (body.notes or "").strip(),
        "requirements": (body.requirements or "").strip(),
        "delivered_url": (body.delivered_url or "").strip(),
        "delivery_notes": (body.delivery_notes or "").strip(),
        "cost_amount": _money(body.cost_amount),
        "due_date": (body.due_date or "").strip(),
        "contract_start_date": (body.contract_start_date or "").strip(),
        "contract_end_date": (body.contract_end_date or "").strip(),
        "onboarding_notes": (body.onboarding_notes or "").strip(),
        "meetings_summary": (body.meetings_summary or "").strip(),
        "confirmed_deal_amount": _money(body.confirmed_deal_amount),
        "payments": payments,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.clients.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.patch("/clients/{client_id}")
async def update_client(client_id: str, body: ClientUpdateIn, user: dict = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": client_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.business_name is not None:
        update["business_name"] = body.business_name.strip()
    if body.contact_name is not None:
        update["contact_name"] = body.contact_name.strip()
    if body.contract_amount is not None:
        contract_amount = _money(body.contract_amount)
        update["contract_amount"] = contract_amount
        update["balance_due"] = round(contract_amount - _money(existing.get("amount_paid")), 2)
    if body.requirements is not None:
        update["requirements"] = body.requirements.strip()
    if body.delivered_url is not None:
        update["delivered_url"] = body.delivered_url.strip()
    if body.delivery_notes is not None:
        update["delivery_notes"] = body.delivery_notes.strip()
    if body.cost_amount is not None:
        update["cost_amount"] = _money(body.cost_amount)
    if body.due_date is not None:
        update["due_date"] = body.due_date.strip()
    if body.contract_start_date is not None:
        update["contract_start_date"] = body.contract_start_date.strip()
    if body.contract_end_date is not None:
        update["contract_end_date"] = body.contract_end_date.strip()
    if body.onboarding_notes is not None:
        update["onboarding_notes"] = body.onboarding_notes.strip()
    if body.meetings_summary is not None:
        update["meetings_summary"] = body.meetings_summary.strip()
    if body.confirmed_deal_amount is not None:
        update["confirmed_deal_amount"] = _money(body.confirmed_deal_amount)
    if body.notes is not None:
        update["notes"] = body.notes.strip()
    if body.status is not None:
        update["status"] = body.status
        if body.status in ("closed", "archived"):
            update["archived_at"] = datetime.now(timezone.utc).isoformat()
        elif body.status == "onboarding":
            update["onboarding_started_at"] = existing.get("onboarding_started_at") or datetime.now(timezone.utc).isoformat()
        elif body.status == "active":
            update["active_started_at"] = existing.get("active_started_at") or datetime.now(timezone.utc).isoformat()
        elif "archived_at" in existing:
            update["archived_at"] = existing.get("archived_at")
    await db.clients.update_one({"id": client_id, "user_id": user["id"]}, {"$set": update})
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@api.post("/clients/{client_id}/payments")
async def add_client_payment(client_id: str, body: ClientPaymentIn, user: dict = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": client_id, "user_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    amount = _money(body.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    paid_at = body.paid_at or datetime.now(timezone.utc).isoformat()
    payment = {"id": str(uuid.uuid4()), "amount": amount, "paid_at": paid_at, "note": (body.note or "").strip(), "kind": "payment"}
    payments = list(existing.get("payments") or [])
    payments.append(payment)
    amount_paid = round(_money(existing.get("amount_paid")) + amount, 2)
    contract_amount = _money(existing.get("contract_amount"))
    cost_amount = _money(existing.get("cost_amount"))
    update = {
        "payments": payments,
        "amount_paid": amount_paid,
        "balance_due": round(contract_amount - amount_paid, 2),
        "total_gained": amount_paid,
        "profit_margin": round(amount_paid - cost_amount, 2),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if update["balance_due"] <= 0:
        update["status"] = "closed"
        update["closed_at"] = datetime.now(timezone.utc).isoformat()
    elif (existing.get("status") or "").lower() == "onboarding":
        update["status"] = "active"
        update["active_started_at"] = existing.get("active_started_at") or datetime.now(timezone.utc).isoformat()
    await db.clients.update_one({"id": client_id, "user_id": user["id"]}, {"$set": update})
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@api.post("/clients/{client_id}/meetings")
async def add_client_meeting(client_id: str, body: ClientMeetingIn, user: dict = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": client_id, "user_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    meeting = {
        "id": str(uuid.uuid4()),
        "meeting_at": body.meeting_at or datetime.now(timezone.utc).isoformat(),
        "title": body.title.strip(),
        "summary": (body.summary or "").strip(),
        "requirements": (body.requirements or "").strip(),
        "next_steps": (body.next_steps or "").strip(),
    }
    meetings = list(existing.get("meetings") or [])
    meetings.append(meeting)
    update = {
        "meetings": meetings,
        "meetings_summary": (existing.get("meetings_summary") or "").strip(),
        "requirements": (body.requirements or existing.get("requirements") or "").strip(),
        "onboarding_notes": (existing.get("onboarding_notes") or "").strip(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.requirements is not None:
        update["requirements"] = body.requirements.strip()
    if body.summary:
        update["meetings_summary"] = (existing.get("meetings_summary") or "") + ("\n" if existing.get("meetings_summary") else "") + body.summary.strip()
    if body.next_steps:
        update["onboarding_notes"] = (existing.get("onboarding_notes") or "") + ("\n" if existing.get("onboarding_notes") else "") + f"Next: {body.next_steps.strip()}"
    await db.clients.update_one({"id": client_id, "user_id": user["id"]}, {"$set": update})
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@api.get("/clients/alerts")
async def client_alerts(user: dict = Depends(get_current_user)):
    clients = await db.clients.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    now = datetime.now(timezone.utc).date()
    alerts = []
    for client in clients:
        if (client.get("status") or "").lower() != "active":
            continue
        due = _parse_date_only(client.get("due_date") or "")
        if due and due < now and _money(client.get("balance_due")) > 0:
            alerts.append({
                "id": client["id"],
                "business_name": client.get("business_name"),
                "balance_due": _money(client.get("balance_due")),
                "due_date": client.get("due_date"),
                "days_overdue": (now - due).days,
            })
    return {"alerts": alerts}


@api.post("/clients/{client_id}/archive")
async def archive_client(client_id: str, user: dict = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": client_id, "user_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.clients.update_one(
        {"id": client_id, "user_id": user["id"]},
        {"$set": {"status": "archived", "archived_at": now_iso, "updated_at": now_iso}},
    )
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@api.post("/clients/{client_id}/close")
async def close_client(client_id: str, user: dict = Depends(get_current_user)):
    existing = await db.clients.find_one({"id": client_id, "user_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.clients.update_one(
        {"id": client_id, "user_id": user["id"]},
        {"$set": {"status": "closed", "closed_at": now_iso, "updated_at": now_iso}},
    )
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@api.get("/clients/summary")
async def client_summary(duration: str = "month", user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    duration = (duration or "month").lower().strip()
    if duration == "day":
        start = now - timedelta(days=1)
    elif duration == "week":
        start = now - timedelta(days=7)
    elif duration == "year":
        start = now - timedelta(days=365)
    else:
        start = now - timedelta(days=30)
        duration = "month"
    clients = await db.clients.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    filtered = []
    for client in clients:
        created_at = _parse_iso_dt(client.get("created_at") or "")
        if created_at and created_at >= start:
            filtered.append(client)
    return {
        "duration": duration,
        "start": start.isoformat(),
        "clients_total": len(clients),
        "active_clients": sum(1 for c in clients if (c.get("status") or "").lower() == "active"),
        "contract_total": round(sum(_money(c.get("contract_amount")) for c in clients), 2),
        "advance_total": round(sum(_money(c.get("advance_paid")) for c in clients), 2),
        "balance_total": round(sum(_money(c.get("balance_due")) for c in clients), 2),
        "total_earned": round(sum(_money(c.get("total_gained")) for c in clients), 2),
        "period_earned": round(sum(_money(c.get("total_gained")) for c in filtered), 2),
        "new_clients": len(filtered),
    }


@api.get("/clients/history")
async def client_history(user: dict = Depends(get_current_user)):
    clients = await db.clients.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"clients": clients}


@api.get("/clients/export")
async def export_clients(user: dict = Depends(get_current_user)):
    clients = await db.clients.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    buf = io.StringIO()
    if clients:
        fields = ["business_name", "contact_name", "status", "contract_amount", "advance_paid", "amount_paid", "balance_due", "requirements", "delivered_url", "delivery_notes", "notes", "created_at", "archived_at"]
        writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for client in clients:
            writer.writerow(client)
    else:
        buf.write("No clients yet.\n")
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=clients.csv"},
    )

# ==================== Analytics ====================

@api.get("/analytics/summary")
async def analytics_summary(user: dict = Depends(get_current_user)):
    uid = user["id"]
    total = await db.leads.count_documents({"user_id": uid})
    no_website = await db.leads.count_documents({"user_id": uid, "has_website": False})
    contacted = await db.leads.count_documents({"user_id": uid, "status": "contacted"})
    interested = await db.leads.count_documents({"user_id": uid, "status": "interested"})
    converted = await db.leads.count_documents({"user_id": uid, "status": "converted"})
    onboarding = await db.leads.count_documents({"user_id": uid, "status": "onboarding"})
    active = await db.leads.count_documents({"user_id": uid, "status": "active"})
    closed = await db.leads.count_documents({"user_id": uid, "status": "closed"})
    archived = await db.leads.count_documents({"user_id": uid, "status": "archived"})
    rejected = await db.leads.count_documents({"user_id": uid, "status": "rejected"})
    new = await db.leads.count_documents({"user_id": uid, "status": "new"})

    # Category breakdown
    pipeline = [
        {"$match": {"user_id": uid}},
        {"$group": {"_id": "$category_searched", "count": {"$sum": 1}, "no_website": {"$sum": {"$cond": [{"$eq": ["$has_website", False]}, 1, 0]}}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    cat_data = await db.leads.aggregate(pipeline).to_list(20)
    categories_data = [{"category": c["_id"] or "unknown", "count": c["count"], "no_website": c["no_website"]} for c in cat_data]

    # Recent activity
    recent = await db.search_history.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(10)

    return {
        "total_leads": total,
        "no_website_leads": no_website,
        "with_website_leads": total - no_website,
        "by_status": {"new": new, "contacted": contacted, "interested": interested, "converted": converted, "onboarding": onboarding, "active": active, "closed": closed, "archived": archived, "rejected": rejected},
        "categories": categories_data,
        "recent_searches": recent,
        "conversion_rate": round((converted / total * 100), 1) if total else 0,
    }

# ==================== Scheduled Searches ====================

@api.get("/schedules")
async def list_schedules(user: dict = Depends(get_current_user)):
    items = await db.schedules.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"schedules": items}

@api.post("/schedules")
async def create_schedule(body: ScheduleIn, user: dict = Depends(get_current_user)):
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "user_id": user["id"],
        "name": body.name,
        "location": body.location,
        "category": body.category,
        "radius_meters": body.radius_meters,
        "hour": body.hour,
        "minute": body.minute,
        "active": body.active,
        "last_run": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.schedules.insert_one(dict(doc))
    if body.active:
        register_job(sid, body.hour, body.minute, user["id"], body.location, body.category, body.radius_meters)
    doc.pop("_id", None)
    return doc

@api.patch("/schedules/{sid}")
async def update_schedule(sid: str, body: ScheduleUpdate, user: dict = Depends(get_current_user)):
    existing = await db.schedules.find_one({"id": sid, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        await db.schedules.update_one({"id": sid}, {"$set": update})
    merged = {**existing, **update}
    # Re-register job
    try:
        scheduler.remove_job(sid)
    except Exception:
        pass
    if merged.get("active"):
        register_job(sid, merged["hour"], merged["minute"], user["id"], merged["location"], merged["category"], merged["radius_meters"])
    doc = await db.schedules.find_one({"id": sid}, {"_id": 0})
    return doc

@api.delete("/schedules/{sid}")
async def delete_schedule(sid: str, user: dict = Depends(get_current_user)):
    result = await db.schedules.delete_one({"id": sid, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    try:
        scheduler.remove_job(sid)
    except Exception:
        pass
    return {"ok": True}

@api.post("/schedules/{sid}/run")
async def run_now(sid: str, user: dict = Depends(get_current_user)):
    s = await db.schedules.find_one({"id": sid, "user_id": user["id"]})
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    result = await run_search(s["location"], s["category"], s["radius_meters"], user["id"], source=f"schedule:{s['name']}")
    await db.schedules.update_one({"id": sid}, {"$set": {"last_run": datetime.now(timezone.utc).isoformat()}})
    return result

# ==================== Settings ====================

SETTING_KEYS = [
    "google_maps_api_key", "gmail_email", "gmail_app_password", "sender_name",
    "openai_api_key", "email_signature"
]

@api.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    env_google = bool(os.environ.get("GOOGLE_MAPS_API_KEY", "").strip())
    db_google = await get_setting_value("google_maps_api_key")
    gmail_email = await get_setting_value("gmail_email")
    gmail_pass = await get_setting_value("gmail_app_password")
    sender_name = await get_setting_value("sender_name")
    email_signature = await get_setting_value("email_signature")

    masked_google = (db_google[:6] + "..." + db_google[-4:]) if db_google and len(db_google) > 10 else None

    return {
        "has_env_key": env_google,
        "has_db_key": bool(db_google),
        "using_mock": not (env_google or db_google),
        "masked_key": masked_google,
        "gmail_email": gmail_email,
        "has_gmail_password": bool(gmail_pass),
        "sender_name": sender_name,
        "email_signature": email_signature,
        "email_configured": bool(gmail_email and gmail_pass),
        "has_openai_key": bool(await get_setting_value("openai_api_key")),
    }

@api.post("/settings")
async def update_settings(body: SettingsIn, user: dict = Depends(get_current_user)):
    updates = body.model_dump()
    SECRET_KEYS = {"openai_api_key", "gmail_app_password", "google_maps_api_key"}
    for k, v in updates.items():
        if v is None:
            continue
        val_str = str(v).strip().strip('"').strip("'")
        if not val_str and k in SECRET_KEYS:
            # Do not overwrite an existing secret key with an empty string
            continue
        await db.settings.update_one(
            {"key": k},
            {"$set": {"key": k, "value": val_str, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    logger.info("User updated settings | user_id=%s keys=%s", user["id"], [k for k, v in updates.items() if v is not None])
    return {"ok": True}



# ==================== Bulk Lead Actions ====================

@api.post("/leads/bulk-update")
async def bulk_update_leads(body: BulkLeadIn, user: dict = Depends(get_current_user)):
    if not body.lead_ids:
        raise HTTPException(status_code=400, detail="No lead_ids provided")
    update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.status:
        update["status"] = body.status
    leads_to_sync = []
    if body.status == "converted":
        leads_to_sync = await db.leads.find({"id": {"$in": body.lead_ids}, "user_id": user["id"]}, {"_id": 0}).to_list(500)
    result = await db.leads.update_many(
        {"id": {"$in": body.lead_ids}, "user_id": user["id"]},
        {"$set": update},
    )
    for lead in leads_to_sync:
        lead["status"] = "converted"
        await _sync_client_from_lead(lead, user["id"])
    return {"ok": True, "matched": result.matched_count, "modified": result.modified_count}

@api.post("/leads/bulk-delete")
async def bulk_delete_leads(body: BulkLeadIn, user: dict = Depends(get_current_user)):
    if not body.lead_ids:
        raise HTTPException(status_code=400, detail="No lead_ids provided")
    result = await db.leads.delete_many({"id": {"$in": body.lead_ids}, "user_id": user["id"]})
    return {"ok": True, "deleted": result.deleted_count}
