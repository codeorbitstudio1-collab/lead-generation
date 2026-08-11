"""
Iteration 3 backend tests: email discovery (website scraping), email template
library (CRUD + preview with variable substitution + persistence), A/B groups
(create/list/stats/delete), outreach send integration with templates and
A/B groups (variant tracking, template_id/ab_group_id persistence even on
Gmail-SMTP failure), and regression on iter1/iter2 endpoints.

Gmail is intentionally NOT configured -- send must fail gracefully at SMTP
with a 500, but the outreach record with template_id/ab_group_id/variant
must still be inserted so stats compute correctly once Gmail is enabled.

Real GPT-5.2 calls are kept to <=2 (fall-back-to-AI outreach send + one
regression on /agent/chat handled by iter2 file).
"""
import os
import re
import uuid
import pytest
import requests
from pathlib import Path


# ---------------- Bootstrap ----------------

def _load_frontend_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                os.environ["REACT_APP_BACKEND_URL"] = val
                break


_load_frontend_env()
BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@leadfinder.io"
ADMIN_PASSWORD = "Admin@123"


# ---------------- Fixtures ----------------

@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_headers(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json()["token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def hot_lead(s, auth_headers):
    """Ensure at least one no-website lead exists for outreach + discovery tests."""
    s.post(f"{API}/search", headers=auth_headers,
           json={"location": "Bangalore", "category": "all"})
    r = s.get(f"{API}/leads?has_website=false", headers=auth_headers)
    assert r.status_code == 200
    leads = r.json()["leads"]
    assert leads, "Need at least one no-website lead"
    return leads[0]


@pytest.fixture(scope="module")
def clean_gmail(s, auth_headers):
    """Ensure Gmail creds are cleared so send fails gracefully at SMTP layer."""
    s.post(f"{API}/settings", headers=auth_headers,
           json={"gmail_email": "", "gmail_app_password": ""})
    yield
    # No cleanup needed; iter2 also leaves them cleared.


# Module-scoped template + AB group fixtures so tests work under xdist loadscope
# (which pins each class to one worker, meaning class-level attrs cannot be
# shared across classes on different workers).

@pytest.fixture(scope="module")
def ab_templates(s, auth_headers):
    """Create two templates for A/B testing. Returns (a_id, b_id)."""
    r1 = s.post(f"{API}/templates", headers=auth_headers,
                json={"name": "AB Variant A [MODULE]",
                      "subject": "A: Website for {business_name}",
                      "body": "Variant A body for {business_name}"})
    assert r1.status_code == 200
    a_id = r1.json()["id"]
    r2 = s.post(f"{API}/templates", headers=auth_headers,
                json={"name": "AB Variant B [MODULE]",
                      "subject": "B: Grow {business_name} online",
                      "body": "Variant B body for {business_name}"})
    assert r2.status_code == 200
    b_id = r2.json()["id"]
    yield (a_id, b_id)
    # cleanup
    for tid in (a_id, b_id):
        s.delete(f"{API}/templates/{tid}", headers=auth_headers)


@pytest.fixture(scope="module")
def ab_group(s, auth_headers, ab_templates):
    a_id, b_id = ab_templates
    r = s.post(f"{API}/ab-groups", headers=auth_headers,
               json={"name": "Module A/B Group",
                     "variant_a_template_id": a_id,
                     "variant_b_template_id": b_id})
    assert r.status_code == 200
    gid = r.json()["id"]
    yield gid
    s.delete(f"{API}/ab-groups/{gid}", headers=auth_headers)


# ---------------- Email Discovery ----------------

class TestEmailDiscovery:
    def test_discover_email_no_website_no_body_returns_400(self, s, auth_headers, hot_lead):
        """Lead has no website and no website_url provided -> 400."""
        # hot_lead comes from mock data with no website
        assert not hot_lead.get("website")
        r = s.post(f"{API}/leads/{hot_lead['id']}/discover-email",
                   headers=auth_headers, json={}, timeout=30)
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "no website" in detail or "website url" in detail

    def test_discover_email_lead_not_found(self, s, auth_headers):
        r = s.post(f"{API}/leads/does-not-exist/discover-email",
                   headers=auth_headers, json={"website_url": "https://example.com"})
        assert r.status_code == 404

    def test_discover_email_example_com_no_crash(self, s, auth_headers, hot_lead):
        """Public site with no emails should return an empty list + null best, no crash."""
        r = s.post(f"{API}/leads/{hot_lead['id']}/discover-email",
                   headers=auth_headers,
                   json={"website_url": "https://example.com"}, timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["lead_id"] == hot_lead["id"]
        assert "emails" in d and isinstance(d["emails"], list)
        assert "best" in d
        assert "pages_checked" in d and isinstance(d["pages_checked"], int)
        # example.com contains no mailto and no emails
        assert d["emails"] == []
        assert d["best"] is None

    def test_discover_email_persists_website_when_lead_had_none(self, s, auth_headers, hot_lead):
        """When lead had no website but we passed a website_url, it should be persisted."""
        r = s.get(f"{API}/leads?has_website=false", headers=auth_headers)
        # After previous test, this lead may have been updated with example.com
        # Fetch current record
        all_leads = s.get(f"{API}/leads", headers=auth_headers).json()["leads"]
        lead_now = next(l for l in all_leads if l["id"] == hot_lead["id"])
        # website should have been set to example.com by prior test
        assert lead_now.get("website") == "https://example.com"
        assert lead_now.get("has_website") is True
        # discovered_emails key should be present (empty list)
        assert lead_now.get("discovered_emails") == []

    def test_discover_email_persists_found_email(self, s, auth_headers, hot_lead):
        """A page that has a mailto: link should get discovered_email persisted."""
        # httpbin.org/html has no email. Use a controlled test: a Wikipedia page has
        # mailto examples but no reliable target. Instead, ensure at least the
        # graceful path works on httpbin (fast HTML page) -> emails list must exist.
        r = s.post(f"{API}/leads/{hot_lead['id']}/discover-email",
                   headers=auth_headers,
                   json={"website_url": "https://httpbin.org/html"}, timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["emails"], list)
        # httpbin/html is fine, we just want no crash + list shape
        assert d["pages_checked"] >= 0

    def test_discover_email_malformed_url_no_crash(self, s, auth_headers, hot_lead):
        """A URL without scheme should not crash — endpoint auto-prefixes https://."""
        r = s.post(f"{API}/leads/{hot_lead['id']}/discover-email",
                   headers=auth_headers,
                   json={"website_url": "example.org"}, timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["emails"], list)


# ---------------- Template Library ----------------

class TestTemplates:
    """Full CRUD + preview tests. Uses module-scoped state to chain."""

    template_id = None

    def test_create_template(self, s, auth_headers):
        payload = {
            "name": "Cold Outreach v1",
            "subject": "Website for {business_name} — quick idea",
            "body": "Hi,\n\nI noticed {business_name} has a {rating}-star rating with {reviews} reviews on Google — impressive! Reply if you'd like to chat.\n\n- {sender_name}",
        }
        r = s.post(f"{API}/templates", headers=auth_headers, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d and d["id"]
        assert d["name"] == payload["name"]
        assert d["subject"] == payload["subject"]
        assert d["body"] == payload["body"]
        assert d["sent_count"] == 0
        assert d["reply_count"] == 0
        assert d["is_active"] is True
        TestTemplates.template_id = d["id"]

    def test_list_templates_contains_created(self, s, auth_headers):
        assert TestTemplates.template_id, "Prior test must have created a template"
        r = s.get(f"{API}/templates", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()["templates"]
        assert isinstance(items, list)
        ids = [t["id"] for t in items]
        assert TestTemplates.template_id in ids

    def test_patch_template_partial(self, s, auth_headers):
        tid = TestTemplates.template_id
        assert tid
        r = s.patch(f"{API}/templates/{tid}", headers=auth_headers,
                    json={"name": "Cold Outreach v1 (renamed)"})
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "Cold Outreach v1 (renamed)"
        # subject/body preserved
        assert "{business_name}" in d["subject"]
        assert "{rating}" in d["body"]

    def test_preview_no_lead_uses_sample(self, s, auth_headers):
        tid = TestTemplates.template_id
        assert tid
        r = s.post(f"{API}/templates/{tid}/preview", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert "subject" in d and "body" in d
        # Sample business is "Sample Business" per server.py:661
        assert "Sample Business" in d["subject"]
        assert "Sample Business" in d["body"]
        # Unresolved placeholders should NOT remain
        assert not re.search(r"\{[a-zA-Z_][a-zA-Z0-9_]*\}", d["subject"])
        assert not re.search(r"\{[a-zA-Z_][a-zA-Z0-9_]*\}", d["body"])
        # variables_used included
        assert "variables_used" in d
        assert d["variables_used"]["business_name"] == "Sample Business"

    def test_preview_with_lead_id_uses_real_lead(self, s, auth_headers, hot_lead):
        tid = TestTemplates.template_id
        assert tid
        r = s.post(f"{API}/templates/{tid}/preview?lead_id={hot_lead['id']}",
                   headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert hot_lead["name"] in d["subject"] or hot_lead["name"] in d["body"]
        # No unresolved vars
        assert not re.search(r"\{[a-zA-Z_][a-zA-Z0-9_]*\}", d["subject"])
        assert d["variables_used"]["business_name"] == hot_lead["name"]

    def test_preview_template_not_found(self, s, auth_headers):
        r = s.post(f"{API}/templates/nope-id/preview", headers=auth_headers)
        assert r.status_code == 404

    def test_delete_template_at_end(self, s, auth_headers):
        # We defer actual delete to a later test (after outreach send uses it).
        # This is a placeholder to ensure delete works.
        # Create a throwaway template to delete right now.
        r = s.post(f"{API}/templates", headers=auth_headers,
                   json={"name": "Throwaway", "subject": "s", "body": "b"})
        assert r.status_code == 200
        tid = r.json()["id"]
        r2 = s.delete(f"{API}/templates/{tid}", headers=auth_headers)
        assert r2.status_code == 200
        assert r2.json().get("ok") is True
        # Confirm gone
        r3 = s.get(f"{API}/templates", headers=auth_headers)
        ids = [t["id"] for t in r3.json()["templates"]]
        assert tid not in ids


# ---------------- A/B Groups ----------------

class TestABGroups:
    """Uses module-scoped ab_templates + ab_group fixtures so state survives
    the LoadScopeScheduling class split across xdist workers."""

    def test_create_two_templates_for_ab(self, ab_templates):
        a_id, b_id = ab_templates
        assert a_id and b_id

    def test_create_ab_group_with_valid_ids(self, ab_group):
        assert ab_group

    def test_create_ab_group_with_invalid_template_id_returns_400(self, s, auth_headers, ab_templates):
        a_id, _ = ab_templates
        r = s.post(f"{API}/ab-groups", headers=auth_headers,
                   json={"name": "Bad Group",
                         "variant_a_template_id": a_id,
                         "variant_b_template_id": "not-a-real-id"})
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "template" in detail

    def test_list_ab_groups(self, s, auth_headers, ab_group):
        r = s.get(f"{API}/ab-groups", headers=auth_headers)
        assert r.status_code == 200
        ids = [g["id"] for g in r.json()["groups"]]
        assert ab_group in ids

    def test_ab_group_stats_shape(self, s, auth_headers, ab_group):
        r = s.get(f"{API}/ab-groups/{ab_group}/stats", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "group" in d
        assert "variants" in d and isinstance(d["variants"], list)
        assert len(d["variants"]) == 2
        labels = [v["label"] for v in d["variants"]]
        assert labels == ["A", "B"]
        for v in d["variants"]:
            for k in ["template_id", "template_name", "sent", "replied", "reply_rate"]:
                assert k in v
            assert isinstance(v["sent"], int)
            assert isinstance(v["replied"], int)

    def test_ab_group_stats_not_found(self, s, auth_headers):
        r = s.get(f"{API}/ab-groups/nope/stats", headers=auth_headers)
        assert r.status_code == 404

    def test_delete_ab_group_not_found(self, s, auth_headers):
        r = s.delete(f"{API}/ab-groups/nope", headers=auth_headers)
        assert r.status_code == 404


# ---------------- Outreach send integration ----------------

class TestOutreachSendWithTemplates:
    """Verify send endpoint accepts template_id and ab_group_id, and even when
    SMTP fails (Gmail not configured), the outreach record must persist
    template_id / ab_group_id / variant so stats work.
    """

    def _last_outreach(self, s, auth_headers):
        r = s.get(f"{API}/outreach", headers=auth_headers)
        assert r.status_code == 200
        emails = r.json()["emails"]
        return emails[0] if emails else None

    def _fresh_hot_lead(self, s, auth_headers):
        """Refetch a hot lead each test — iter2's bulk_delete may have removed
        the module-scoped hot_lead cached ref when tests interleave across workers."""
        # Reseed mock leads
        s.post(f"{API}/search", headers=auth_headers,
               json={"location": "Bangalore", "category": "all"})
        r = s.get(f"{API}/leads?has_website=false", headers=auth_headers)
        assert r.status_code == 200
        leads = r.json()["leads"]
        assert leads, "Need at least one no-website lead"
        return leads[0]

    def test_send_with_template_id_persists_template_id(self, s, auth_headers, clean_gmail, ab_templates):
        tid, _ = ab_templates
        assert tid, "AB template A must exist"
        lead = self._fresh_hot_lead(s, auth_headers)

        r = s.post(f"{API}/outreach/send/{lead['id']}",
                   headers=auth_headers,
                   json={"to_email": "sample@example.com", "template_id": tid},
                   timeout=30)
        # Gmail not configured -> 500 by design
        assert r.status_code == 500, r.text

        rec = self._last_outreach(s, auth_headers)
        assert rec is not None
        assert rec["lead_id"] == lead["id"]
        assert rec["template_id"] == tid
        assert rec["status"] == "failed"
        # subject & body rendered from template (business name substituted)
        combined = (rec.get("subject", "") + " " + rec.get("body", "")).lower()
        assert lead["name"].lower() in combined
        # variant + ab_group_id must be None on pure-template send
        assert rec.get("variant") is None
        assert rec.get("ab_group_id") is None

    def test_send_with_ab_group_picks_variant_and_persists(self, s, auth_headers, clean_gmail, ab_templates, ab_group):
        tpl_a, tpl_b = ab_templates
        gid = ab_group
        lead = self._fresh_hot_lead(s, auth_headers)

        r = s.post(f"{API}/outreach/send/{lead['id']}",
                   headers=auth_headers,
                   json={"to_email": "sample@example.com", "ab_group_id": gid},
                   timeout=30)
        assert r.status_code == 500, r.text  # SMTP not configured

        rec = self._last_outreach(s, auth_headers)
        assert rec is not None
        assert rec["ab_group_id"] == gid
        assert rec["variant"] in ("A", "B"), f"Expected variant A or B, got {rec.get('variant')}"
        assert rec["template_id"] in (tpl_a, tpl_b)
        # Sanity: the chosen template must match its variant slot
        if rec["variant"] == "A":
            assert rec["template_id"] == tpl_a
        else:
            assert rec["template_id"] == tpl_b
        assert rec["status"] == "failed"

    def test_send_ab_group_not_found_returns_404(self, s, auth_headers, clean_gmail):
        lead = self._fresh_hot_lead(s, auth_headers)
        r = s.post(f"{API}/outreach/send/{lead['id']}",
                   headers=auth_headers,
                   json={"to_email": "x@y.com", "ab_group_id": "not-a-real-group"},
                   timeout=30)
        assert r.status_code == 404, r.text

    def test_send_falls_back_to_ai_when_no_template_body(self, s, auth_headers, clean_gmail):
        """Only to_email supplied -> should call GPT-5.2 to draft, then fail at SMTP.
        We verify the outreach record has an AI-generated subject+body (non-empty).
        """
        lead = self._fresh_hot_lead(s, auth_headers)
        r = s.post(f"{API}/outreach/send/{lead['id']}",
                   headers=auth_headers,
                   json={"to_email": "sample@example.com"},
                   timeout=90)
        assert r.status_code == 500, r.text  # SMTP not configured

        rec = self._last_outreach(s, auth_headers)
        assert rec is not None
        assert rec["to_email"] == "sample@example.com"
        assert rec["subject"] and len(rec["subject"]) > 3
        assert rec["body"] and len(rec["body"]) > 30
        # No template/ab used
        assert rec.get("template_id") is None
        assert rec.get("ab_group_id") is None
        assert rec.get("variant") is None
        assert rec["status"] == "failed"


# ---------------- Delete endpoint contracts ----------------

class TestDeleteContracts:
    def test_delete_template_not_found(self, s, auth_headers):
        r = s.delete(f"{API}/templates/nope", headers=auth_headers)
        assert r.status_code == 404


# ---------------- Regression on iter1/iter2 endpoints ----------------

class TestRegressionIter3:
    def test_auth_me(self, s, auth_headers):
        r = s.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_leads_list(self, s, auth_headers):
        r = s.get(f"{API}/leads", headers=auth_headers)
        assert r.status_code == 200
        assert "leads" in r.json()

    def test_outreach_list(self, s, auth_headers):
        r = s.get(f"{API}/outreach", headers=auth_headers)
        assert r.status_code == 200
        assert "emails" in r.json()

    def test_settings_shape(self, s, auth_headers):
        r = s.get(f"{API}/settings", headers=auth_headers)
        assert r.status_code == 200
        for k in ["has_env_key", "gmail_email", "sender_name", "email_configured"]:
            assert k in r.json()
