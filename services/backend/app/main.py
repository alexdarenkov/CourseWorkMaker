"""Монолит CourseWorkMaker: auth + convert + ai в одном FastAPI-приложении.
JWT проверяется здесь же (замена gateway, SEC-1). Документы пользователь
хранит локально (localStorage браузера + экспорт .zip) — серверного CRUD нет."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .ai.router import router as ai_router
from .auth.router import router as auth_router
from .convert.router import router as convert_router
from .db import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создание таблиц (users) при старте. Тесты гоняют на SQLite.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="CourseWorkMaker backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "aiConfigured": bool(os.environ.get("AI_API_KEY"))}


app.include_router(auth_router)
app.include_router(convert_router)
app.include_router(ai_router)
