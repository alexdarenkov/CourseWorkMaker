"""Бэкенд CourseWorkMaker: конвертация MD → DOCX в одном FastAPI-приложении.
Аккаунтов нет, БД нет: документы пользователь хранит локально (localStorage
браузера + импорт .zip), сервер только конвертирует."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .limits import RequestSizeLimit
from .convert.router import router as convert_router

app = FastAPI(title="CourseWorkMaker backend", version="1.0.0")

app.add_middleware(RequestSizeLimit)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


app.include_router(convert_router)
