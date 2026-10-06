"""Конвертация MD → DOCX по ГОСТ (маршрут /api/convert/docx).

Логика сборки — `gost.py`/`md_parser.py`/`omml.py`, перенесены из бывшего
converter-сервиса без изменений (инвариант паритета с превью). Маршрут
публичный: аккаунтов в MVP нет, от перегрузки защищают лимиты размера и
не более двух одновременных конвертаций."""

import logging
import re
from threading import BoundedSemaphore
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response

from .gost import build_docx
from .models import ConvertRequest

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/convert", tags=["convert"])

MAX_MARKDOWN_CHARS = 2_000_000
_slots = BoundedSemaphore(2)


def _attachment(data: bytes, doc_name: str, ext: str, media_type: str) -> Response:
    safe_name = re.sub(r'[\\/:*?"<>|\r\n]+', "_", doc_name).strip() or "document"
    filename = quote(f"{safe_name}.{ext}")
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


def _build_docx_checked(req: ConvertRequest) -> bytes:
    if len(req.markdown) > MAX_MARKDOWN_CHARS:
        raise HTTPException(status_code=413, detail="Документ слишком большой")
    if not _slots.acquire(blocking=False):
        raise HTTPException(429, "Конвертер занят. Повторите запрос позже.")
    try:
        return build_docx(req.markdown, req.settings, req.assets)
    except Exception:
        log.exception("Conversion failed")
        raise HTTPException(status_code=500, detail="Не удалось сформировать DOCX")
    finally:
        _slots.release()


@router.post("/docx")
def convert_docx(req: ConvertRequest) -> Response:
    return _attachment(
        _build_docx_checked(req),
        req.doc_name,
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
