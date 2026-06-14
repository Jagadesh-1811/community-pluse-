import pytest
from fastapi.testclient import TestClient
from main import app, brute_force_protector, rate_limiter

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_protectors():
    brute_force_protector.failed_attempts.clear()
    brute_force_protector.blocked_until.clear()
    rate_limiter.history.clear()
    yield

def test_security_headers_present():
    response = client.post("/auth/verify-code", json={"code": "TEST_CODE_1", "role": "VOLUNTEER"})
    assert response.status_code == 200
    
    headers = response.headers
    assert "Strict-Transport-Security" in headers
    assert "Content-Security-Policy" in headers
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-XSS-Protection") == "1; mode=block"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

def test_swagger_csp_bypass():
    response = client.get("/docs")
    assert response.status_code == 200
    # CSP should not block docs styles/scripts
    assert "Content-Security-Policy" not in response.headers

def test_verify_code_success():
    response = client.post("/auth/verify-code", json={"code": "TEST_CODE_1", "role": "VOLUNTEER"})
    assert response.status_code == 200
    assert response.json() == {"status": "success", "valid": True}

def test_verify_code_invalid():
    response = client.post("/auth/verify-code", json={"code": "INVALID_CODE", "role": "VOLUNTEER"})
    assert response.status_code == 400
    assert "INVALID ACCESS CODE" in response.json().get("detail")

def test_verify_code_brute_force_protection():
    for _ in range(5):
        response = client.post("/auth/verify-code", json={"code": "INVALID_CODE", "role": "VOLUNTEER"})
        assert response.status_code == 400

    response_blocked = client.post("/auth/verify-code", json={"code": "TEST_CODE_1", "role": "VOLUNTEER"})
    assert response_blocked.status_code == 403
    assert "Brute force protection active" in response_blocked.json().get("detail")

def test_verify_code_rate_limiting():
    for _ in range(10):
        client.post("/auth/verify-code", json={"code": "TEST_CODE_1", "role": "VOLUNTEER"})
        
    response = client.post("/auth/verify-code", json={"code": "TEST_CODE_1", "role": "VOLUNTEER"})
    assert response.status_code == 429
    assert "Too many" in response.json().get("detail")

def test_intake_success():
    payload = {
        "text": "students are stuck in a lift, they need help",
        "source": "web",
        "lat": 12.9716,
        "lng": 77.5946,
        "reporter_email": "reporter@example.com"
    }
    response = client.post("/intake", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "success"
    assert "id" in data
    assert data.get("data", {}).get("id") is not None

def test_intake_rate_limiting():
    payload = {"text": "emergency test", "source": "web"}
    for _ in range(60):
        client.post("/intake", json=payload)

    response = client.post("/intake", json=payload)
    assert response.status_code == 429
    assert "Too many reports" in response.json().get("detail")

# JWT Endpoint Protection Tests
def test_status_update_authorized():
    headers = {"Authorization": "Bearer valid_volunteer_token"}
    payload = {"need_id": "mock_need_id", "status": "in_progress", "notes": "On the way"}
    response = client.post("/status/update", json=payload, headers=headers)
    assert response.status_code == 200

def test_status_update_unauthorized():
    # Missing token
    payload = {"need_id": "mock_need_id", "status": "in_progress"}
    response = client.post("/status/update", json=payload)
    assert response.status_code == 401

    # Invalid token
    headers = {"Authorization": "Bearer invalid_token"}
    response = client.post("/status/update", json=payload, headers=headers)
    assert response.status_code == 401

def test_create_volunteer_admin_authorized():
    headers = {"Authorization": "Bearer valid_admin_token"}
    payload = {
        "email": "new_vol@example.com",
        "domain": "human",
        "categories": ["cardiac_cpr"]
    }
    response = client.post("/admin/create-volunteer", json=payload, headers=headers)
    assert response.status_code == 200

def test_create_volunteer_volunteer_unauthorized():
    # Volunteers cannot access admin onboarding endpoints
    headers = {"Authorization": "Bearer valid_volunteer_token"}
    payload = {
        "email": "new_vol@example.com",
        "domain": "human",
        "categories": ["cardiac_cpr"]
    }
    response = client.post("/admin/create-volunteer", json=payload, headers=headers)
    assert response.status_code == 403
