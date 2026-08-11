"""
Application configuration.

All values are read from environment variables (via .env).
Startup validation ensures critical secrets are properly set.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# ─── Load .env ────────────────────────────────────────────────────────────────

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ─── Database ─────────────────────────────────────────────────────────────────

MONGO_URL: str = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME: str = os.environ.get("DB_NAME", "leadgen")

# ─── JWT ──────────────────────────────────────────────────────────────────────

JWT_SECRET: str = os.environ.get("JWT_SECRET", "")
JWT_ALGORITHM: str = "HS256"

# ─── Logging ──────────────────────────────────────────────────────────────────

LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO").upper()

# ─── Startup Validation ───────────────────────────────────────────────────────

def validate_config() -> None:
    """
    Validate critical configuration at startup.
    Raises ValueError for any insecure or missing required value.
    """
    errors = []

    if not JWT_SECRET or JWT_SECRET in ("change-me", "secret", "dev", "test"):
        errors.append(
            "JWT_SECRET must be set to a strong random value in .env. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )

    if not MONGO_URL:
        errors.append("MONGO_URL must be set in .env")

    if errors:
        raise ValueError(
            "LeadGen startup aborted due to insecure configuration:\n"
            + "\n".join(f"  ✗ {e}" for e in errors)
        )
