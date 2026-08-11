"""
Centralized structured logger for LeadGen Command Center.

Usage:
    from utils.logger import get_logger
    logger = get_logger(__name__)

    logger.info("User registered", extra={"user_id": uid, "email": email})
    logger.error("Login failed", extra={"email": email, "reason": "bad password"})

LOG_LEVEL env var controls verbosity (DEBUG / INFO / WARNING / ERROR). Defaults to INFO.
"""
import logging
import os
import sys
from typing import Optional


# ─── Configuration ────────────────────────────────────────────────────────────

_LOG_LEVEL_STR: str = os.environ.get("LOG_LEVEL", "INFO").upper()
_LOG_LEVEL: int = getattr(logging, _LOG_LEVEL_STR, logging.INFO)

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


# ─── Root handler setup (runs once) ───────────────────────────────────────────

def _configure_root_logger() -> None:
    """Configure the root logger once at import time."""
    root = logging.getLogger()
    if root.handlers:
        # Already configured (e.g. uvicorn set it up)
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(_LOG_LEVEL)
    formatter = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)
    handler.setFormatter(formatter)
    root.addHandler(handler)
    root.setLevel(_LOG_LEVEL)


_configure_root_logger()


# ─── Public API ───────────────────────────────────────────────────────────────

def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Return a named logger with the configured log level.

    Args:
        name: Typically ``__name__`` of the calling module.

    Returns:
        A configured ``logging.Logger`` instance.
    """
    logger = logging.getLogger(name or "leadgen")
    logger.setLevel(_LOG_LEVEL)
    return logger


def mask_secret(value: str, visible_chars: int = 4) -> str:
    """
    Mask a sensitive string for safe logging.

    Examples:
        mask_secret("sk-abc123xyz") → "sk-a...xyz"
        mask_secret("short")       → "****"
    """
    if not value:
        return "<empty>"
    if len(value) <= visible_chars * 2:
        return "*" * len(value)
    return f"{value[:visible_chars]}...{value[-visible_chars:]}"
