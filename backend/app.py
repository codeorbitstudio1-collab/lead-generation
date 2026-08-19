import os
import time

from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware

from core import app, api
from lifecycle import lifespan
import routes.crm  # noqa: F401
import routes.growth  # noqa: F401 (registers routes via side-effect)
import routes.freelance  # noqa: F401
import routes.coldcall  # noqa: F401 (cold-call queue + call scripts)
from utils.logger import get_logger

logger = get_logger("api.access")

# Set modern lifespan handler on FastAPI application
app.router.lifespan_context = lifespan

allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.middleware("http")
async def log_api_requests(request: Request, call_next):
    """Log every API request and its response status/duration."""
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error(
            "API | %s %s | unhandled error: %s",
            request.method, request.url.path, exc,
        )
        raise
    duration_ms = (time.perf_counter() - start) * 1000
    if response.status_code >= 400:
        logger.warning(
            "API | %s %s -> %s | %.0f ms",
            request.method, request.url.path, response.status_code, duration_ms,
        )
    else:
        logger.info(
            "API | %s %s -> %s | %.0f ms",
            request.method, request.url.path, response.status_code, duration_ms,
        )
    return response


app.include_router(api)
