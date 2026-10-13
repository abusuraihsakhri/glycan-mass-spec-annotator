"""HTTP-level security and contract regression checks."""
from fastapi.testclient import TestClient
from agents.api import app

client = TestClient(app)


def test_reject_phi_with_controlled_response():
    response = client.post("/api/audit", json={
        "task_id": "MRN-123456",
        "target_identifier": "SPEC-1",
        "primary_metric": 10.0,
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "Task rejected by input privacy policy"


def test_audit_logs_require_separate_admin_token(monkeypatch):
    monkeypatch.delenv("AUDIT_ADMIN_TOKEN", raising=False)
    assert client.get("/api/audit/logs").status_code == 403
    assert client.get("/api/audit/logs", headers={"X-Audit-Token": "guess"}).status_code == 403
    monkeypatch.setenv("AUDIT_ADMIN_TOKEN", "test-admin-token-456")
    assert client.get("/api/audit/logs").status_code == 403
    authorized = client.get("/api/audit/logs", headers={"X-Audit-Token": "test-admin-token-456"})
    assert authorized.status_code == 200
    assert authorized.json()["verified"] is True


def test_metrics_endpoint_returns_json_not_prometheus_text():
    response = client.get("/metrics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert "dossiers_processed_total" in response.json()
