"""Конфигурация монолита из переменных окружения (единая точка входа)."""

import os

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
