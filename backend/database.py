"""
Database and application object initialisation.

Creates the FastAPI app, MongoDB client, and APScheduler instances.
Logging is configured via utils.logger so all modules share the same setup.
"""
from fastapi import FastAPI, APIRouter
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import MONGO_URL, DB_NAME
from utils.logger import get_logger

logger = get_logger(__name__)

# ─── MongoDB ──────────────────────────────────────────────────────────────────

try:
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]
    logger.info("MongoDB client created | url=%s db=%s", MONGO_URL.split("@")[-1], DB_NAME)
except Exception as exc:
    logger.critical("Failed to create MongoDB client: %s", exc)
    raise

# ─── FastAPI ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title="LeadGen Command Center",
    description="AI-powered local business lead generation and outreach platform.",
    version="1.0.0",
)
api = APIRouter(prefix="/api")

# ─── Scheduler ────────────────────────────────────────────────────────────────

scheduler = AsyncIOScheduler(timezone="UTC")
