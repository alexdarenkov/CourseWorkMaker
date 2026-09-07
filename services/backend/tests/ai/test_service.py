"""HTTP-поверхность /api/ai/* (с JWT вместо X-User-Id) и хранилище задач."""

import time

from app.ai import config
from app.ai.jobs import JobStore

# ---------- endpoints ----------


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_ai_requires_auth(client):
    # Замена gateway: без токена ИИ-маршруты возвращают 401.
    assert client.get("/api/ai/jobs/x").status_code == 401
    assert (
        client.post(
            "/api/ai/edit", json={"instruction": "исправь введение", "markdown": "# Текст"}
        ).status_code
        == 401
    )


def test_generate_unconfigured_returns_503(client, auth, monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "")
    headers, _ = auth()
    resp = client.post("/api/ai/generate", headers=headers, data={"options": "{}"})
    assert resp.status_code == 503


def test_generate_invalid_options_returns_422(client, auth, monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "test-key")
    headers, _ = auth()
    resp = client.post(
        "/api/ai/generate", headers=headers, data={"options": '{"topic": ""}'}
    )
    assert resp.status_code == 422


def test_plan_requires_auth(client):
    resp = client.post("/api/ai/plan", json={"topic": "Тема курсовой"})
    assert resp.status_code == 401


def test_plan_unconfigured_returns_503(client, auth, monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "")
    headers, _ = auth()
    resp = client.post("/api/ai/plan", headers=headers, json={"topic": "Тема курсовой"})
    assert resp.status_code == 503


def test_plan_invalid_topic_returns_422(client, auth, monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "test-key")
    headers, _ = auth()
    resp = client.post("/api/ai/plan", headers=headers, json={"topic": "ab"})
    assert resp.status_code == 422


def test_edit_unconfigured_returns_503(client, auth, monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "")
    headers, _ = auth()
    resp = client.post(
        "/api/ai/edit",
        headers=headers,
        json={"instruction": "сделай введение подробнее", "markdown": "# Введение\n\nТекст."},
    )
    assert resp.status_code == 503


def test_job_status_not_found(client, auth):
    headers, _ = auth()
    assert client.get("/api/ai/jobs/no-such-job", headers=headers).status_code == 404


def test_job_belongs_to_user(client, auth):
    from app.ai.jobs import store

    ha, a = auth(email="a@example.com")
    hb, _ = auth(email="b@example.com")
    job = store.create(a["user"]["id"])  # владелец задачи = id из токена
    try:
        assert client.get(f"/api/ai/jobs/{job.id}", headers=ha).status_code == 200
        assert client.get(f"/api/ai/jobs/{job.id}", headers=hb).status_code == 404
    finally:
        store._jobs.pop(job.id, None)


def test_job_exposes_partial_markdown(client, auth):
    from app.ai.jobs import store

    headers, a = auth()
    job = store.create(a["user"]["id"])
    try:
        job.partial = "# Введение\n\nУже написанный текст."
        resp = client.get(f"/api/ai/jobs/{job.id}", headers=headers)
        assert resp.json()["partial"] == "# Введение\n\nУже написанный текст."
    finally:
        store._jobs.pop(job.id, None)


# ---------- JobStore ----------


def test_store_create_and_get():
    store = JobStore()
    job = store.create("u1")
    assert store.get(job.id) is job
    assert job.status == "queued"


def test_has_active_only_for_running_jobs():
    store = JobStore()
    job = store.create("u1")
    assert store.has_active("u1")
    assert not store.has_active("u2")
    job.status = "done"
    assert not store.has_active("u1")


def test_cleanup_removes_expired_jobs():
    store = JobStore()
    job = store.create("u1")
    job.created_at = time.time() - config.JOB_TTL_SECONDS - 1
    store.create("u2")  # create() запускает уборку
    assert store.get(job.id) is None
