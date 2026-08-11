"""
Freelance project routes: fetch from public sources + CRUD pipeline.

Endpoints:
  - GET  /freelance             → list saved projects (pipeline)
  - POST /freelance/fetch       → fetch projects from public APIs/RSS
  - POST /freelance             → manually add a project
  - POST /freelance/{id}/enrich → find company website + contact details
  - PATCH /freelance/{id}       → update project fields / status
  - DELETE /freelance/{id}      → delete a project
  - GET  /freelance/stats       → pipeline counts
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, Depends

from core import api, db, get_current_user, FreelanceProjectIn, FreelanceUpdateIn
from freelance import fetch_freelance_projects, _find_company_contacts
from utils.logger import get_logger

logger = get_logger(__name__)

STATUSES = ["new", "applied", "interviewing", "offer", "accepted", "rejected", "completed", "archived"]

FREELANCE_STATUSES = STATUSES


@api.get("/freelance")
async def list_freelance_projects(
    status: Optional[str] = None,
    platform: Optional[str] = None,
    q: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: Dict[str, Any] = {"user_id": user["id"]}
    if status:
        query["status"] = status
    if platform:
        query["platform"] = platform
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"company": {"$regex": q, "$options": "i"}},
            {"job_description": {"$regex": q, "$options": "i"}},
            {"requirements": {"$regex": q, "$options": "i"}},
        ]
    projects = await db.freelance.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"projects": projects, "total": len(projects)}


@api.get("/freelance/stats")
async def freelance_stats(user: dict = Depends(get_current_user)):
    uid = user["id"]
    counts = {}
    for s in FREELANCE_STATUSES:
        counts[s] = await db.freelance.count_documents({"user_id": uid, "status": s})
    total = await db.freelance.count_documents({"user_id": uid})
    return {"statuses": counts, "total": total}


@api.post("/freelance/fetch")
async def freelance_fetch(
    body: Optional[Dict[str, Any]] = None,
    user: dict = Depends(get_current_user),
):
    body = body or {}
    query = (body.get("query") or "").strip()
    source = (body.get("source") or "all").strip()
    limit = min(int(body.get("limit") or 25), 100)
    days = int(body.get("days") or 30)

    result = await fetch_freelance_projects(query, source, limit, days)

    saved = 0
    already = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    for proj in result["projects"]:
        existing = await db.freelance.find_one({
            "user_id": user["id"],
            "id": proj["id"],
        })
        if existing:
            already += 1
            continue
        doc = {
            **proj,
            "user_id": user["id"],
            "status": "new",
            "notes": "",
            "deadline": None,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.freelance.insert_one(doc)
        saved += 1

    logger.info(
        "Freelance fetch persisted | user_id=%s query=%s source=%s days=%s fetched=%d saved=%d already=%d",
        user["id"], query, source, days, len(result["projects"]), saved, already,
    )
    return {
        "ok": True,
        "fetched": len(result["projects"]),
        "saved": saved,
        "already": already,
        "per_source": result["results_per_source"],
        "projects": result["projects"],
    }


@api.post("/freelance")
async def create_freelance_project(body: FreelanceProjectIn, user: dict = Depends(get_current_user)):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Project title is required")
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": title,
        "company": (body.company or "").strip() or None,
        "job_description": (body.job_description or "").strip() or None,
        "requirements": (body.requirements or "").strip() or None,
        "email": (body.email or "").strip() or None,
        "phones": [p.strip() for p in (body.phones or []) if p.strip()] or None,
        "budget": (body.budget or "").strip() or None,
        "currency": (body.currency or "").strip() or None,
        "platform": (body.platform or "").strip() or None,
        "platform_url": (body.platform_url or "").strip() or None,
        "website": (body.website or "").strip() or None,
        "location": (body.location or "").strip() or None,
        "skills": [s.strip() for s in (body.skills or []) if s.strip()] or None,
        "posted_at": body.posted_at,
        "deadline": body.deadline,
        "notes": (body.notes or "").strip() or None,
        "status": body.status if body.status in FREELANCE_STATUSES else "new",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.freelance.insert_one(dict(doc))
    logger.info(
        "Freelance project created | user_id=%s title=%s platform=%s",
        user["id"], title, doc["platform"],
    )
    return doc


@api.get("/freelance/{project_id}")
async def get_freelance_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.freelance.find_one({"id": project_id, "user_id": user["id"]}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Freelance project not found")
    return project


@api.post("/freelance/{project_id}/enrich")
async def enrich_freelance_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.freelance.find_one({"id": project_id, "user_id": user["id"]}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Freelance project not found")

    company = (project.get("company") or "").strip()
    if not company:
        raise HTTPException(status_code=400, detail="No company name to search for")

    found = await _find_company_contacts(company)

    update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if found.get("website"):
        update["website"] = found["website"]
    if found.get("email"):
        update["email"] = found["email"]
    if found.get("phones"):
        update["phones"] = found["phones"]
    if not update or update == {"updated_at": update["updated_at"]}:
        return {"ok": False, "project": project, "message": "No contact details found for this company"}

    await db.freelance.update_one(
        {"id": project_id, "user_id": user["id"]}, {"$set": update}
    )
    enriched = await db.freelance.find_one({"id": project_id, "user_id": user["id"]}, {"_id": 0})
    logger.info(
        "Freelance project enriched | user_id=%s id=%s website=%s email=%s phones=%d",
        user["id"], project_id, found.get("website"), found.get("email"), len(found.get("phones") or []),
    )
    return {"ok": True, "project": enriched}


@api.patch("/freelance/{project_id}")
async def update_freelance_project(
    project_id: str, body: FreelanceUpdateIn, user: dict = Depends(get_current_user)
):
    update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    fields = [
        "title", "company", "job_description", "requirements", "email",
        "phones", "budget", "currency", "platform", "platform_url",
        "website", "location", "skills", "posted_at", "deadline", "notes",
    ]
    for f in fields:
        v = getattr(body, f, None)
        if v is not None:
            update[f] = v
    if body.status is not None:
        update["status"] = body.status if body.status in FREELANCE_STATUSES else "new"

    result = await db.freelance.update_one(
        {"id": project_id, "user_id": user["id"]}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Freelance project not found")
    project = await db.freelance.find_one({"id": project_id, "user_id": user["id"]}, {"_id": 0})
    return project


@api.delete("/freelance/{project_id}")
async def delete_freelance_project(project_id: str, user: dict = Depends(get_current_user)):
    result = await db.freelance.delete_one({"id": project_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Freelance project not found")
    return {"ok": True}
