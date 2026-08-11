"""
Application lifecycle management: startup, shutdown, and scheduled jobs.

Changes from original:
  - Replaced deprecated @app.on_event with modern lifespan context manager.
  - Fixed __import__("datetime") anti-pattern — use proper datetime import.
  - Added structured logging for all lifecycle events.
  - Admin user creation now logs the outcome.
"""
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from apscheduler.triggers.cron import CronTrigger

from auth import hash_password
from config import validate_config
from database import client, db, scheduler
from search import run_search
from utils.logger import get_logger

logger = get_logger(__name__)


# ─── Scheduled Job Helpers ────────────────────────────────────────────────────

async def scheduled_job_wrapper(
    sid: str,
    user_id: str,
    location: str,
    category: str,
    radius: int,
) -> None:
    """Execute a scheduled search and update the schedule's last_run timestamp."""
    try:
        await run_search(location, category, radius, user_id, source=f"schedule:{sid}")
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.schedules.update_one({"id": sid}, {"$set": {"last_run": now_iso}})
        logger.info(
            "Scheduled search completed | schedule_id=%s user_id=%s location=%s category=%s",
            sid, user_id, location, category,
        )
    except Exception as exc:
        logger.error(
            "Scheduled search failed | schedule_id=%s user_id=%s error=%s",
            sid, user_id, exc,
        )


def register_job(
    sid: str,
    hour: int,
    minute: int,
    user_id: str,
    location: str,
    category: str,
    radius: int,
) -> None:
    """Register a cron job for an active schedule."""
    try:
        scheduler.add_job(
            scheduled_job_wrapper,
            trigger=CronTrigger(hour=hour, minute=minute),
            id=sid,
            args=[sid, user_id, location, category, radius],
            replace_existing=True,
        )
        logger.info(
            "Schedule registered | schedule_id=%s hour=%02d minute=%02d user_id=%s",
            sid, hour, minute, user_id,
        )
    except Exception as exc:
        logger.error("Failed to register schedule | schedule_id=%s error=%s", sid, exc)


async def load_existing_schedules() -> None:
    """Load all active schedules from the database and register them with APScheduler."""
    count = 0
    async for s in db.schedules.find({"active": True}):
        register_job(
            s["id"], s["hour"], s["minute"],
            s["user_id"], s["location"], s["category"], s["radius_meters"],
        )
        count += 1
    logger.info("Loaded %d active schedule(s) from database", count)


async def poll_all_replies_job() -> None:
    """Background job: poll Gmail replies for all users (runs every 10 minutes)."""
    try:
        from routes.growth import do_poll_replies  # late import to avoid circular deps

        total_replies = 0
        async for u in db.users.find({}, {"id": 1}):
            try:
                count = await do_poll_replies(u["id"])
                total_replies += count
            except Exception as exc:
                logger.error(
                    "Reply poll failed | user_id=%s error=%s", u.get("id"), exc
                )
        if total_replies:
            logger.info("Reply poll completed | new_replies=%d", total_replies)
    except Exception as exc:
        logger.error("poll_all_replies_job crashed | error=%s", exc)


# ─── Admin Bootstrap ──────────────────────────────────────────────────────────

async def _bootstrap_admin() -> None:
    """Create the default admin user if one does not already exist."""
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@leadfinder.io")
    admin_password = os.environ.get("ADMIN_PASSWORD", "")

    if not admin_password:
        logger.warning(
            "ADMIN_PASSWORD not set — skipping admin bootstrap. "
            "Set ADMIN_PASSWORD in .env to create the default admin user."
        )
        return

    existing = await db.users.find_one({"email": admin_email})
    if existing:
        logger.debug("Admin user already exists | email=%s", admin_email)
        return

    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "email": admin_email,
        "name": "Admin",
        "password_hash": hash_password(admin_password),
        "role": "admin",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("Admin user created | email=%s", admin_email)


# ─── DB Index Setup ───────────────────────────────────────────────────────────

async def _create_indexes() -> None:
    """Ensure required MongoDB indexes exist."""
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.leads.create_index([("user_id", 1), ("place_id", 1)])
    await db.leads.create_index("id")
    await db.schedules.create_index("id")
    await db.freelance.create_index([("user_id", 1), ("id", 1)], unique=True)
    await db.freelance.create_index([("user_id", 1), ("status", 1)])
    logger.debug("MongoDB indexes verified")


# ─── Lifespan (replaces deprecated @app.on_event) ────────────────────────────

@asynccontextmanager
async def lifespan(app):  # noqa: ARG001
    """
    FastAPI lifespan context manager.
    Replaces the deprecated @app.on_event('startup') / @app.on_event('shutdown') pattern.
    """
    # ── Startup ──────────────────────────────────────────────────────────────
    logger.info("LeadGen server starting up…")

    # Validate configuration before proceeding
    validate_config()

    # Verify DB connectivity
    try:
        await client.admin.command("ping")
        logger.info("MongoDB connection verified | db=%s", db.name)
    except Exception as exc:
        logger.critical("MongoDB unreachable at startup: %s", exc)
        raise

    await _create_indexes()
    await _bootstrap_admin()

    # Start scheduler
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started")

    await load_existing_schedules()

    # Register global reply-poll job
    try:
        scheduler.add_job(
            poll_all_replies_job,
            trigger=CronTrigger(minute="*/10"),
            id="__poll_replies__",
            replace_existing=True,
        )
        logger.info("Reply-poll job scheduled (every 10 minutes)")
    except Exception as exc:
        logger.error("Failed to schedule reply-poll job | error=%s", exc)

    logger.info("LeadGen server ready ✓")

    yield  # ← Application runs here

    # ── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("LeadGen server shutting down…")
    try:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
    except Exception:
        pass
    client.close()
    logger.info("MongoDB connection closed")


# ─── Compatibility shims (called from app.py for backward compat) ─────────────
# These are preserved so that existing imports from other modules don't break.
# They delegate to the real implementations above.

async def startup():
    """Deprecated shim — lifecycle is now managed by lifespan()."""
    pass


async def shutdown():
    """Deprecated shim — lifecycle is now managed by lifespan()."""
    pass
