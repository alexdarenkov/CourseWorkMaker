"""Тесты HTTP-поверхности ai-сервиса и хранилища задач."""

import time

from fastapi.testclient import TestClient

from app import config
from app.jobs import JobStore
from app.main import app

client = TestClient(app)


# ---------- endpoints ----------

def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_generate_unconfigured_returns_503(monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "")
    resp = client.post("/generate", data={"options": "{}"})
    assert resp.status_code == 503


def test_generate_invalid_options_returns_422(monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "test-key")
    resp = client.post("/generate", data={"options": '{"topic": ""}'})
    assert resp.status_code == 422


def test_edit_unconfigured_returns_503(monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "")
    resp = client.post(
        "/edit",
        json={"instruction": "сделай введение подробнее", "markdown": "# Введение\n\nТекст."},
    )
    assert resp.status_code == 503


def test_job_status_not_found():
    resp = client.get("/jobs/no-such-job")
    assert resp.status_code == 404


def test_job_belongs_to_user(monkeypatch):
    from app.main import store

    job = store.create("user-a")
    try:
        ok = client.get(f"/jobs/{job.id}", headers={"X-User-Id": "user-a"})
        assert ok.status_code == 200
        foreign = client.get(f"/jobs/{job.id}", headers={"X-User-Id": "user-b"})
        assert foreign.status_code == 404
    finally:
        store._jobs.pop(job.id, None)


def test_job_exposes_partial_markdown():
    from app.main import store

    job = store.create("user-a")
    try:
        job.partial = "# Введение\n\nУже написанный текст."
        resp = client.get(f"/jobs/{job.id}", headers={"X-User-Id": "user-a"})
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


def test_cleanup_removes_expired_jobs(monkeypatch):
    store = JobStore()
    job = store.create("u1")
    job.created_at = time.time() - config.JOB_TTL_SECONDS - 1
    store.create("u2")  # create() запускает уборку
    assert store.get(job.id) is None
