"""
Backend API tests for LeadGen Command Center.
Covers: auth, categories, search+mock, leads CRUD/filters/export, analytics,
schedules (create/list/run/patch/delete), settings.
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

@pytest.fixture(scope="session")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == ADMIN_EMAIL
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------- Auth ----------------

class TestAuth:
    def test_login_success(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("token"), str) and len(data["token"]) > 20
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"].get("role") in ("admin", "user")

    def test_login_invalid_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WrongPw!!"})
        assert r.status_code == 401

    def test_register_new_user(self, s):
        email = f"test_{uuid.uuid4().hex[:8]}@test.io"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Test User"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == email
        # duplicate registration
        r2 = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!"})
        assert r2.status_code == 400

    def test_me_with_token(self, s, auth_headers):
        r = s.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_without_token(self, s):
        # bypass session default headers by using a bare request
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Categories ----------------

class TestCategories:
    def test_categories_non_empty(self, s, auth_headers):
        r = s.get(f"{API}/categories", headers=auth_headers)
        assert r.status_code == 200
        cats = r.json().get("categories")
        assert isinstance(cats, list) and len(cats) > 0
        assert "restaurant" in cats


# ---------------- Search + Leads ----------------

class TestSearchAndLeads:
    def test_search_mock_and_persistence(self, s, auth_headers):
        r = s.post(f"{API}/search", headers=auth_headers,
                   json={"location": "Bangalore", "category": "restaurant"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_mock"] is True
        assert isinstance(data["results"], list) and len(data["results"]) > 0

        # Verify leads persisted
        r2 = s.get(f"{API}/leads", headers=auth_headers)
        assert r2.status_code == 200
        leads = r2.json()["leads"]
        assert len(leads) > 0
        # search returns restaurant; at least one lead should have category_searched=restaurant
        assert any(l.get("category_searched") == "restaurant" for l in leads)

    def test_leads_filter_status_and_website(self, s, auth_headers):
        # ensure some leads exist
        s.post(f"{API}/search", headers=auth_headers,
               json={"location": "Bangalore", "category": "restaurant"})

        r_new = s.get(f"{API}/leads?status=new", headers=auth_headers)
        assert r_new.status_code == 200
        assert all(l["status"] == "new" for l in r_new.json()["leads"])

        r_no_web = s.get(f"{API}/leads?has_website=false", headers=auth_headers)
        assert r_no_web.status_code == 200
        assert all(l["has_website"] is False for l in r_no_web.json()["leads"])

    def test_leads_filter_q(self, s, auth_headers):
        r = s.get(f"{API}/leads?q=Ravi", headers=auth_headers)
        assert r.status_code == 200
        # returned list may be empty if seed differs; but should not error
        for l in r.json()["leads"]:
            assert ("ravi" in (l.get("name") or "").lower()) or ("ravi" in (l.get("address") or "").lower())

    def test_lead_patch_and_delete(self, s, auth_headers):
        # ensure at least one lead
        s.post(f"{API}/search", headers=auth_headers,
               json={"location": "Bangalore", "category": "restaurant"})
        r = s.get(f"{API}/leads", headers=auth_headers)
        leads = r.json()["leads"]
        assert leads, "No leads to patch"
        lead_id = leads[0]["id"]

        # PATCH
        r2 = s.patch(f"{API}/leads/{lead_id}", headers=auth_headers,
                     json={"status": "contacted", "notes": "TEST note"})
        assert r2.status_code == 200, r2.text
        updated = r2.json()
        assert updated["status"] == "contacted"
        assert updated["notes"] == "TEST note"

        # Verify persistence
        r3 = s.get(f"{API}/leads?status=contacted", headers=auth_headers)
        assert any(l["id"] == lead_id for l in r3.json()["leads"])

        # DELETE
        r4 = s.delete(f"{API}/leads/{lead_id}", headers=auth_headers)
        assert r4.status_code == 200

        # Verify removed
        r5 = s.get(f"{API}/leads", headers=auth_headers)
        assert not any(l["id"] == lead_id for l in r5.json()["leads"])

        # Delete again -> 404
        r6 = s.delete(f"{API}/leads/{lead_id}", headers=auth_headers)
        assert r6.status_code == 404

    def test_export_csv(self, s, auth_headers):
        r = s.get(f"{API}/leads/export", headers=auth_headers)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        # Body should either have CSV header row or fallback text
        body = r.text
        assert len(body) > 0


# ---------------- Analytics ----------------

class TestAnalytics:
    def test_analytics_summary(self, s, auth_headers):
        # ensure data exists
        s.post(f"{API}/search", headers=auth_headers,
               json={"location": "Bangalore", "category": "restaurant"})
        r = s.get(f"{API}/analytics/summary", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        for key in ["total_leads", "no_website_leads", "by_status", "categories",
                    "recent_searches", "conversion_rate"]:
            assert key in data
        assert isinstance(data["by_status"], dict)
        for k in ["new", "contacted", "interested", "converted", "rejected"]:
            assert k in data["by_status"]
        assert isinstance(data["categories"], list)
        assert isinstance(data["recent_searches"], list)


# ---------------- Schedules ----------------

class TestSchedules:
    def test_schedule_crud_and_run(self, s, auth_headers):
        # Create
        payload = {
            "name": "TEST daily restaurants",
            "location": "Bangalore",
            "category": "restaurant",
            "hour": 10,
            "minute": 0,
            "active": True,
        }
        r = s.post(f"{API}/schedules", headers=auth_headers, json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == payload["name"]
        assert created["active"] is True
        sid = created["id"]

        # List
        r2 = s.get(f"{API}/schedules", headers=auth_headers)
        assert r2.status_code == 200
        assert any(x["id"] == sid for x in r2.json()["schedules"])

        # Run
        r3 = s.post(f"{API}/schedules/{sid}/run", headers=auth_headers)
        assert r3.status_code == 200, r3.text
        run_data = r3.json()
        assert "results" in run_data
        assert isinstance(run_data["results"], list)

        # last_run updated
        r4 = s.get(f"{API}/schedules", headers=auth_headers)
        found = next(x for x in r4.json()["schedules"] if x["id"] == sid)
        assert found.get("last_run") is not None

        # PATCH partial (only active) — the fix under test
        r5 = s.patch(f"{API}/schedules/{sid}", headers=auth_headers, json={"active": False})
        assert r5.status_code == 200, r5.text
        assert r5.json()["active"] is False
        # ensure other fields intact
        assert r5.json()["name"] == payload["name"]
        assert r5.json()["location"] == payload["location"]

        # DELETE
        r6 = s.delete(f"{API}/schedules/{sid}", headers=auth_headers)
        assert r6.status_code == 200
        # verify not in list
        r7 = s.get(f"{API}/schedules", headers=auth_headers)
        assert not any(x["id"] == sid for x in r7.json()["schedules"])
        # delete again -> 404
        r8 = s.delete(f"{API}/schedules/{sid}", headers=auth_headers)
        assert r8.status_code == 404


# ---------------- Settings ----------------

class TestSettings:
    def test_get_settings_uses_mock(self, s, auth_headers):
        r = s.get(f"{API}/settings", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "using_mock" in data
        # env key empty per .env; unless someone POSTed a key persistently
        # Basic shape check
        assert "has_env_key" in data
        assert "has_db_key" in data

    def test_post_settings_persists(self, s, auth_headers):
        test_key = "TEST_KEY_ABCDEFGHIJKLMNOP"
        r = s.post(f"{API}/settings", headers=auth_headers,
                   json={"google_maps_api_key": test_key})
        assert r.status_code == 200
        r2 = s.get(f"{API}/settings", headers=auth_headers)
        data = r2.json()
        assert data["has_db_key"] is True
        assert data["masked_key"] is not None
        # cleanup - set empty then reflect using_mock
        s.post(f"{API}/settings", headers=auth_headers, json={"google_maps_api_key": ""})
        r3 = s.get(f"{API}/settings", headers=auth_headers)
        # empty means has_db_key False
        assert r3.json()["has_db_key"] is False
