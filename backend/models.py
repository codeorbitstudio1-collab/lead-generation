"""
Pydantic models for request/response validation.

BUSINESS_CATEGORIES and MOCK_RESULTS have been moved to utils/constants.py.
This file re-exports them for backward compatibility with existing imports.
"""
from typing import List, Optional

from pydantic import BaseModel, EmailStr, field_validator

# Re-export constants so existing `from models import BUSINESS_CATEGORIES` still works
from utils.constants import BUSINESS_CATEGORIES, MOCK_RESULTS  # noqa: F401


# ─── Auth ─────────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


# ─── Search ───────────────────────────────────────────────────────────────────

class SearchIn(BaseModel):
    location: str
    category: str
    radius_meters: int = 5000
    no_website_only: bool = False
    discovery_mode: Optional[str] = "maps"
    discovery_modes: Optional[List[str]] = None

    @field_validator("radius_meters")
    @classmethod
    def radius_in_range(cls, v: int) -> int:
        if not (100 <= v <= 50_000):
            raise ValueError("radius_meters must be between 100 and 50000")
        return v

    @field_validator("discovery_mode")
    @classmethod
    def discovery_mode_valid(cls, v: Optional[str]) -> str:
        v = (v or "maps").strip().lower()
        if v not in {"maps", "web", "directory", "social", "reviews", "jobs", "all"}:
            raise ValueError("discovery_mode must be maps, web, directory, social, reviews, jobs, or all")
        return v

    @field_validator("discovery_modes")
    @classmethod
    def discovery_modes_valid(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        allowed = {"maps", "web", "directory", "social", "reviews", "jobs"}
        cleaned = []
        for item in v:
            mode = (item or "").strip().lower()
            if not mode:
                continue
            if mode == "all":
                return ["maps", "web", "directory", "social", "reviews", "jobs"]
            if mode not in allowed:
                raise ValueError("discovery_modes must contain only supported sources")
            if mode not in cleaned:
                cleaned.append(mode)
        return cleaned or None


class SetupPlannerIn(BaseModel):
    business_name: str
    service: str
    location: str
    goal: Optional[str] = "find leads"
    target_customer: Optional[str] = None
    monthly_budget: Optional[float] = None
    channels: Optional[List[str]] = None
    timeline_days: int = 30

    @field_validator("timeline_days")
    @classmethod
    def timeline_in_range(cls, v: int) -> int:
        if not (1 <= v <= 365):
            raise ValueError("timeline_days must be between 1 and 365")
        return v


# ─── Leads ────────────────────────────────────────────────────────────────────

class LeadUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    email: Optional[EmailStr] = None


class BulkLeadIn(BaseModel):
    lead_ids: List[str]
    status: Optional[str] = None


class LeadContactIn(BaseModel):
    channel: str = "call"
    direction: Optional[str] = "outbound"
    status: Optional[str] = None
    summary: Optional[str] = None
    notes: Optional[str] = None
    occurred_at: Optional[str] = None

    @field_validator("channel")
    @classmethod
    def channel_valid(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in {"email", "call", "manual_call", "sms"}:
            raise ValueError("channel must be one of: email, call, manual_call, sms")
        return v

    @field_validator("direction")
    @classmethod
    def direction_valid(cls, v: Optional[str]) -> str:
        v = (v or "outbound").strip().lower()
        if v not in {"outbound", "inbound"}:
            raise ValueError("direction must be outbound or inbound")
        return v


class ManualLeadIn(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    has_website: Optional[bool] = None
    category_searched: Optional[str] = None
    location_searched: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "new"


# ─── Schedules ────────────────────────────────────────────────────────────────

class ScheduleIn(BaseModel):
    name: str
    location: str
    category: str
    radius_meters: int = 5000
    hour: int = 10
    minute: int = 0
    active: bool = True
    send_emails: bool = False

    @field_validator("hour")
    @classmethod
    def hour_in_range(cls, v: int) -> int:
        if not (0 <= v <= 23):
            raise ValueError("hour must be between 0 and 23 (UTC)")
        return v

    @field_validator("minute")
    @classmethod
    def minute_in_range(cls, v: int) -> int:
        if not (0 <= v <= 59):
            raise ValueError("minute must be between 0 and 59")
        return v


class ScheduleUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None
    radius_meters: Optional[int] = None
    hour: Optional[int] = None
    minute: Optional[int] = None
    active: Optional[bool] = None
    send_emails: Optional[bool] = None

    @field_validator("hour")
    @classmethod
    def hour_in_range(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (0 <= v <= 23):
            raise ValueError("hour must be between 0 and 23 (UTC)")
        return v

    @field_validator("minute")
    @classmethod
    def minute_in_range(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (0 <= v <= 59):
            raise ValueError("minute must be between 0 and 59")
        return v


# ─── Settings ─────────────────────────────────────────────────────────────────

class SettingsIn(BaseModel):
    google_maps_api_key: Optional[str] = None
    gmail_email: Optional[str] = None
    gmail_app_password: Optional[str] = None
    sender_name: Optional[str] = None
    openai_api_key: Optional[str] = None
    email_signature: Optional[str] = None



# ─── Outreach ─────────────────────────────────────────────────────────────────

class OutreachSendIn(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    to_email: Optional[str] = None
    template_id: Optional[str] = None
    ab_group_id: Optional[str] = None


# ─── Templates ────────────────────────────────────────────────────────────────

class TemplateIn(BaseModel):
    name: str
    subject: str
    body: str
    is_active: bool = True


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    is_active: Optional[bool] = None


# ─── A/B Groups ───────────────────────────────────────────────────────────────

class ABGroupIn(BaseModel):
    name: str
    variant_a_template_id: str
    variant_b_template_id: str
    active: bool = True


# ─── AI Agent ─────────────────────────────────────────────────────────────────

class AgentChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None


# ─── Email Discovery ──────────────────────────────────────────────────────────

class DiscoverEmailIn(BaseModel):
    website_url: Optional[str] = None


# ─── Clients ──────────────────────────────────────────────────────────────────

class ClientCreateIn(BaseModel):
    lead_id: Optional[str] = None
    business_name: str
    contact_name: Optional[str] = None
    contract_amount: float
    advance_paid: float = 0
    requirements: Optional[str] = None
    delivered_url: Optional[str] = None
    delivery_notes: Optional[str] = None
    cost_amount: Optional[float] = None
    due_date: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    onboarding_notes: Optional[str] = None
    meetings_summary: Optional[str] = None
    confirmed_deal_amount: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = "active"


class ClientUpdateIn(BaseModel):
    business_name: Optional[str] = None
    contact_name: Optional[str] = None
    contract_amount: Optional[float] = None
    requirements: Optional[str] = None
    delivered_url: Optional[str] = None
    delivery_notes: Optional[str] = None
    cost_amount: Optional[float] = None
    due_date: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    onboarding_notes: Optional[str] = None
    meetings_summary: Optional[str] = None
    confirmed_deal_amount: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class ClientPaymentIn(BaseModel):
    amount: float
    paid_at: Optional[str] = None
    note: Optional[str] = None


class ClientMeetingIn(BaseModel):
    meeting_at: Optional[str] = None
    title: str
    summary: Optional[str] = None
    requirements: Optional[str] = None
    next_steps: Optional[str] = None


# ─── Freelance Projects ───────────────────────────────────────────────────────

class FreelanceProjectIn(BaseModel):
    title: str
    company: Optional[str] = None
    job_description: Optional[str] = None
    requirements: Optional[str] = None
    email: Optional[str] = None
    phones: Optional[List[str]] = None
    budget: Optional[str] = None
    currency: Optional[str] = None
    platform: Optional[str] = None
    platform_url: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[List[str]] = None
    posted_at: Optional[str] = None
    deadline: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "new"


class FreelanceUpdateIn(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    job_description: Optional[str] = None
    requirements: Optional[str] = None
    email: Optional[str] = None
    phones: Optional[List[str]] = None
    budget: Optional[str] = None
    currency: Optional[str] = None
    platform: Optional[str] = None
    platform_url: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[List[str]] = None
    posted_at: Optional[str] = None
    deadline: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
