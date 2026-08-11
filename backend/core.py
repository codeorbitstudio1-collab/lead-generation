"""
Central re-export barrel.

Provides a single import location for shared objects used across routes.
Only imports that routes actually need are exposed here.
"""
from config import JWT_ALGORITHM, JWT_SECRET, MONGO_URL, DB_NAME  # noqa: F401 (re-exported for compat)
from database import app, api, client, db, scheduler  # noqa: F401
from models import (  # noqa: F401
    ABGroupIn,
    AgentChatIn,
    BUSINESS_CATEGORIES,
    BulkLeadIn,
    ManualLeadIn,
    LeadContactIn,
    ClientCreateIn,
    ClientMeetingIn,
    ClientPaymentIn,
    ClientUpdateIn,
    DiscoverEmailIn,
    FreelanceProjectIn,
    FreelanceUpdateIn,
    LeadUpdate,
    LoginIn,
    MOCK_RESULTS,
    OutreachSendIn,
    RegisterIn,
    ScheduleIn,
    ScheduleUpdate,
    SearchIn,
    SetupPlannerIn,
    SettingsIn,
    TemplateIn,
    TemplateUpdate,
)
from auth import create_token, get_current_user, hash_password, verify_password  # noqa: F401
from search import fetch_places, geocode_location, get_api_key, run_search  # noqa: F401
from lifecycle import (  # noqa: F401
    load_existing_schedules,
    poll_all_replies_job,
    register_job,
    scheduled_job_wrapper,
    shutdown,
    startup,
)


async def get_setting_value(key: str) -> str:
    """
    Retrieve a single settings value from the database.

    Args:
        key: The settings key to look up.

    Returns:
        The setting value string, or ``""`` if not found.
    """
    doc = await db.settings.find_one({"key": key})
    return (doc or {}).get("value", "") or ""
