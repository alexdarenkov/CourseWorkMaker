"""Тестовое окружение: SQLite в файле (портируемые типы моделей позволяют
не поднимать Postgres). Секрет и URL БД задаются ДО импорта приложения."""

import os
import tempfile

_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ.setdefault("JWT_SECRET", "test-secret-key-at-least-32-bytes-long!!!")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_db():
    Base.metadata.create_all(bind=engine)
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth(client):
    """Регистрирует пользователя → (заголовки с Bearer, тело ответа)."""

    def _register(email="user@example.com", password="password123", name="Тест"):
        r = client.post(
            "/api/auth/register",
            json={"name": name, "email": email, "password": password},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        return {"Authorization": f"Bearer {body['token']}"}, body

    return _register
