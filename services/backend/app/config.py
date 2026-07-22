"""Конфигурация монолита из переменных окружения (единая точка входа)."""

import os

# --- Безопасность / JWT ---
# Секрет тот же, что был у Java-сервисов (HS256) — ранее выпущенные токены
# остаются валидными после перехода на монолит.
JWT_SECRET: str = os.environ.get("JWT_SECRET", "")
JWT_TTL_HOURS: int = int(os.environ.get("JWT_TTL_HOURS", "168"))

# --- База данных ---
# Одна БД: только таблица users (документы живут в localStorage браузера).
DATABASE_URL: str = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://coursework:coursework@localhost:5432/coursework"
)

# --- CORS ---
# Нужен только dev-серверу vite (:5173) и прямому обращению на :3000; в проде
# фронт ходит на /api тем же origin через nginx, и CORS не срабатывает.
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000,http://localhost:5173"
    ).split(",")
    if o.strip()
]
