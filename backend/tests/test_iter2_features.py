"""
Iteration 2 backend tests: outreach (GPT-5.2 email generation, Gmail SMTP wiring,
IMAP reply polling, outreach list/stats), AI agent chat + history, bulk lead
actions, extended settings, and regression on auth/search.

Gmail creds are NOT configured -- we assert graceful failure paths only.
LLM calls are kept minimal (~2-3) to preserve Emergent LLM credits.
"""
import os
import uuid
import pytest
import requests
from pathlib import Path


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
    """Ensure at least one hot (no-website) lead exists for admin. Return the lead dict."""
    # Trigger a mock search — mock data has several no-website leads
    r = s.post(f"{API}/search", headers=auth_headers,
               json={"location": "Bangalore", "category": "restaurant"})
    assert r.status_code == 200
    # Get leads without a website
    r2 = s.get(f"{API}/leads?has_website=false", headers=auth_headers)
    assert r2.status_code == 200
    leads = r2.json()["leads"]
    assert leads, "Need at least one hot (no-website) lead for outreach tests"
    return leads[0]


# ---------------- Regression: auth + search still work ----------------

class TestRegression:
    def test_login_still_works(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_search_still_works(self, s, auth_headers):
        r = s.post(f"{API}/search", headers=auth_headers,
                   json={"location": "Bangalore", "category": "restaurant"})
        assert r.status_code == 200
        data = r.json()
        assert "results" in data and isinstance(data["results"], list)


# ---------------- Extended Settings ----------------

class TestSettingsExtended:
    def test_get_settings_extended_shape(self, s, auth_headers):
        r = s.get(f"{API}/settings", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        # Google Maps fields (existing)
        for k in ["has_env_key", "has_db_key", "using_mock"]:
            assert k in data, f"missing key {k}"
        # New iteration-2 fields
        for k in ["gmail_email", "has_gmail_password", "sender_name", "email_configured"]:
            assert k in data, f"missing new settings key {k}"
        assert isinstance(data["has_gmail_password"], bool)
        assert isinstance(data["email_configured"], bool)

    def test_post_gmail_settings_persist_and_partial_update(self, s, auth_headers):
        # Save initial google_maps_api_key state
        pre = s.get(f"{API}/settings", headers=auth_headers).json()
        pre_has_db_key = pre.get("has_db_key")

        # Post gmail creds
        payload = {
            "gmail_email": "sender.test@gmail.com",
            "gmail_app_password": "abcd efgh ijkl mnop",
            "sender_name": "LeadGen Sales",
        }
        r = s.post(f"{API}/settings", headers=auth_headers, json=payload)
        assert r.status_code == 200

        r2 = s.get(f"{API}/settings", headers=auth_headers)
        d = r2.json()
        assert d["gmail_email"] == payload["gmail_email"]
        assert d["has_gmail_password"] is True
        assert d["sender_name"] == payload["sender_name"]
        assert d["email_configured"] is True
        # Google-maps state should not have changed
        assert d["has_db_key"] == pre_has_db_key

        # Partial update: only google_maps_api_key (do not touch gmail)
        r3 = s.post(f"{API}/settings", headers=auth_headers,
                    json={"google_maps_api_key": "PARTIAL_UPDATE_TEST_KEY_12345"})
        assert r3.status_code == 200
        r4 = s.get(f"{API}/settings", headers=auth_headers)
        d2 = r4.json()
        # Gmail fields should still be present
        assert d2["gmail_email"] == payload["gmail_email"]
        assert d2["has_gmail_password"] is True
        assert d2["sender_name"] == payload["sender_name"]
        assert d2["has_db_key"] is True

        # Cleanup: reset gmail creds AND the google maps key we just set
        s.post(f"{API}/settings", headers=auth_headers,
               json={"gmail_email": "", "gmail_app_password": "", "sender_name": "",
                     "google_maps_api_key": ""})
        r5 = s.get(f"{API}/settings", headers=auth_headers).json()
        assert r5["email_configured"] is False
        assert r5["has_gmail_password"] is False


# ---------------- AI Agent Chat ----------------

class TestAgentChat:
    def test_agent_chat_general_question(self, s, auth_headers):
        """Real GPT-5.2 call — verify friendly reply + session_id + action may be null."""
        payload = {"message": "What can this app help me with in one sentence?"}
        r = s.post(f"{API}/agent/chat", headers=auth_headers, json=payload, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_id" in data and isinstance(data["session_id"], str)
        assert "reply" in data and isinstance(data["reply"], str) and len(data["reply"]) > 10
        # action can be None for a general Q&A
        assert "action" in data
        # persist for the persistence test
        pytest.SESSION_ID = data["session_id"]

    def test_agent_chat_session_persistence_and_history(self, s, auth_headers):
        sid = getattr(pytest, "SESSION_ID", None)
        assert sid, "Prior chat test must have set SESSION_ID"
        # Follow-up in same session (also real LLM call)
        r = s.post(f"{API}/agent/chat", headers=auth_headers,
                   json={"message": "Repeat back only the word: OK", "session_id": sid}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d["session_id"] == sid

        # History endpoint should now contain >= 4 messages (2 user, 2 assistant)
        r2 = s.get(f"{API}/agent/history?session_id={sid}", headers=auth_headers)
        assert r2.status_code == 200
        msgs = r2.json()["messages"]
        assert isinstance(msgs, list)
        assert len(msgs) >= 4, f"Expected >=4 history msgs, got {len(msgs)}"
        roles = [m["role"] for m in msgs]
        assert roles.count("user") >= 2
        assert roles.count("assistant") >= 2

    def test_agent_chat_intent_open_page(self, s, auth_headers):
        """Ask agent to open the leads page — expect action.type == 'open_page', params.page == 'leads'."""
        r = s.post(f"{API}/agent/chat", headers=auth_headers,
                   json={"message": "Please open the leads page for me."}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("reply"), str)
        action = d.get("action")
        # LLM must produce open_page action
        assert action is not None, f"Expected an action, got None. Reply={d.get('reply')}"
        assert action.get("type") == "open_page", f"Expected type open_page, got {action}"
        params = action.get("params") or {}
        assert params.get("page") == "leads", f"Expected params.page=leads, got {params}"


# ---------------- Outreach: Generate / Send / List / Stats / Poll ----------------

class TestOutreachGenerate:
    def test_generate_email_for_hot_lead(self, s, auth_headers, hot_lead):
        """Real GPT-5.2 call — subject + body should reference business name/rating."""
        r = s.post(f"{API}/outreach/generate/{hot_lead['id']}", headers=auth_headers, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["lead_id"] == hot_lead["id"]
        assert "subject" in d and isinstance(d["subject"], str) and len(d["subject"]) > 3
        assert "body" in d and isinstance(d["body"], str) and len(d["body"]) > 40
        # Business name should appear in subject OR body (personalization check)
        name = hot_lead.get("name", "")
        combined = (d["subject"] + " " + d["body"]).lower()
        assert name.lower() in combined or any(tok in combined for tok in name.lower().split()), \
            f"Personalization: business name '{name}' not found in generated email."

    def test_generate_email_lead_not_found(self, s, auth_headers):
        r = s.post(f"{API}/outreach/generate/does-not-exist", headers=auth_headers)
        assert r.status_code == 404


class TestOutreachSend:
    def test_send_without_gmail_creds_returns_500(self, s, auth_headers, hot_lead):
        """Gmail not configured — should return 500 with meaningful error, not crash."""
        # Ensure gmail creds are cleared
        s.post(f"{API}/settings", headers=auth_headers,
               json={"gmail_email": "", "gmail_app_password": ""})
        r = s.post(f"{API}/outreach/send/{hot_lead['id']}", headers=auth_headers,
                   json={"to_email": "someone@example.com",
                         "subject": "Test", "body": "Hi there"}, timeout=30)
        assert r.status_code == 500, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "gmail" in detail or "credential" in detail or "not configured" in detail, \
            f"Expected gmail-not-configured error, got: {detail}"

    def test_send_without_to_email_returns_400(self, s, auth_headers, hot_lead):
        """No to_email provided and lead has no email in notes — expect 400."""
        # Ensure notes don't contain any email address
        s.patch(f"{API}/leads/{hot_lead['id']}", headers=auth_headers,
                json={"notes": "no email here"})
        r = s.post(f"{API}/outreach/send/{hot_lead['id']}", headers=auth_headers,
                   json={"subject": "Test", "body": "Hi"}, timeout=30)
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "email" in detail and ("no email" in detail or "not" in detail or "address" in detail)

    def test_send_lead_not_found(self, s, auth_headers):
        r = s.post(f"{API}/outreach/send/does-not-exist", headers=auth_headers,
                   json={"to_email": "x@y.com", "subject": "s", "body": "b"})
        assert r.status_code == 404


class TestOutreachListAndStats:
    def test_list_outreach(self, s, auth_headers):
        r = s.get(f"{API}/outreach", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert "emails" in d and isinstance(d["emails"], list)

    def test_outreach_stats_shape(self, s, auth_headers):
        r = s.get(f"{API}/outreach/stats", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["sent", "replied", "failed", "reply_rate"]:
            assert k in d, f"missing key {k}"
        assert isinstance(d["sent"], int)
        assert isinstance(d["replied"], int)
        assert isinstance(d["failed"], int)


class TestOutreachPollReplies:
    def test_poll_replies_graceful_when_not_configured(self, s, auth_headers):
        # Ensure gmail creds are cleared
        s.post(f"{API}/settings", headers=auth_headers,
               json={"gmail_email": "", "gmail_app_password": ""})
        r = s.post(f"{API}/outreach/poll-replies", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("new_replies") == 0


# ---------------- Bulk Lead Actions ----------------

class TestBulkLeads:
    def test_bulk_update_status(self, s, auth_headers):
        # Ensure we have >=2 leads by using category='all' (mock returns all 8)
        s.post(f"{API}/search", headers=auth_headers,
               json={"location": "Bangalore", "category": "all"})
        r = s.get(f"{API}/leads", headers=auth_headers)
        leads = r.json()["leads"]
        assert len(leads) >= 2, f"Need at least 2 leads for bulk-update, got {len(leads)}"
        ids = [l["id"] for l in leads[:2]]

        r2 = s.post(f"{API}/leads/bulk-update", headers=auth_headers,
                    json={"lead_ids": ids, "status": "contacted"})
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d.get("ok") is True
        assert d.get("matched") == 2
        # 'modified' may be 0 if already contacted from a prior test run — verify persistence instead
        assert d.get("modified") >= 0

        # Verify persistence — both leads should now be contacted
        r3 = s.get(f"{API}/leads?status=contacted", headers=auth_headers)
        contacted_ids = {l["id"] for l in r3.json()["leads"]}
        for lid in ids:
            assert lid in contacted_ids, f"Lead {lid} not marked contacted after bulk-update"

    def test_bulk_update_empty_ids_returns_400(self, s, auth_headers):
        r = s.post(f"{API}/leads/bulk-update", headers=auth_headers,
                   json={"lead_ids": [], "status": "contacted"})
        assert r.status_code == 400
        detail = (r.json().get("detail") or "").lower()
        assert "lead_ids" in detail or "no" in detail

    def test_bulk_delete(self, s, auth_headers):
        # create/refresh multiple mock leads via category='all'
        s.post(f"{API}/search", headers=auth_headers,
               json={"location": "Bangalore", "category": "all"})
        r = s.get(f"{API}/leads", headers=auth_headers)
        leads = r.json()["leads"]
        assert len(leads) >= 2, f"Need at least 2 leads for bulk-delete, got {len(leads)}"
        ids = [l["id"] for l in leads[:2]]

        r2 = s.post(f"{API}/leads/bulk-delete", headers=auth_headers,
                    json={"lead_ids": ids})
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d.get("ok") is True
        assert d.get("deleted") == 2

        # Verify gone
        r3 = s.get(f"{API}/leads", headers=auth_headers)
        remaining = {l["id"] for l in r3.json()["leads"]}
        for lid in ids:
            assert lid not in remaining

    def test_bulk_delete_empty_ids_returns_400(self, s, auth_headers):
        r = s.post(f"{API}/leads/bulk-delete", headers=auth_headers,
                   json={"lead_ids": []})
        assert r.status_code == 400
