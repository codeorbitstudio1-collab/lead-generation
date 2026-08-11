"""
Authentication helpers: password hashing, JWT creation, and request guard.

Security notes:
  - bcrypt with auto-generated salt for password hashing.
  - HS256 JWT with 7-day expiry by default.
  - All auth events (login success/failure, token decode errors) are logged
    for audit and anomaly detection.
"""
from datetime import datetime, timezone, timedelta
from typing import Dict

import bcrypt
import jwt

from fastapi import HTTPException, Request

from config import JWT_SECRET, JWT_ALGORITHM
from database import db
from utils.logger import get_logger

logger = get_logger(__name__)


# ─── Password Utilities ───────────────────────────────────────────────────────

def hash_password(pw: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    """
    Verify a plaintext password against a bcrypt hash.
    Returns False on any error rather than raising.
    """
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception as exc:
        logger.warning("Password verification error: %s", exc)
        return False


# ─── JWT Utilities ────────────────────────────────────────────────────────────

def create_token(user_id: str, email: str, days: int = 7) -> str:
    """
    Create a signed JWT for the given user.

    Args:
        user_id: The user's UUID.
        email:   The user's email address.
        days:    Token validity in days (default: 7).

    Returns:
        Encoded JWT string.
    """
    expiry = datetime.now(timezone.utc) + timedelta(days=days)
    payload: Dict = {"sub": user_id, "email": email, "exp": expiry}
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    logger.debug("JWT created | user_id=%s expires_in_days=%d", user_id, days)
    return token


# ─── Request Guard ────────────────────────────────────────────────────────────

async def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency — extracts and validates the Bearer JWT from the request.

    Raises:
        HTTPException 401 if the token is missing, expired, or invalid.
    """
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        logger.warning(
            "Auth rejected | reason=missing_bearer | path=%s | ip=%s",
            request.url.path,
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header[7:]

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        logger.warning(
            "Auth rejected | reason=token_expired | path=%s | ip=%s",
            request.url.path,
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        logger.warning(
            "Auth rejected | reason=invalid_token | path=%s | ip=%s | detail=%s",
            request.url.path,
            request.client.host if request.client else "unknown",
            str(exc),
        )
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one(
        {"id": payload["sub"]}, {"_id": 0, "password_hash": 0}
    )

    if not user:
        logger.warning(
            "Auth rejected | reason=user_not_found | user_id=%s | path=%s",
            payload.get("sub"),
            request.url.path,
        )
        raise HTTPException(status_code=401, detail="User not found")

    return user
