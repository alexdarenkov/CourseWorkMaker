"""Конвертация MD → DOCX по ГОСТ (маршрут /api/convert/docx).

Логика сборки — `gost.py`/`md_parser.py`/`omml.py`, перенесены из бывшего
converter-сервиса без изменений (инвариант паритета с превью). Экспорт требует
входа (JWT-зависимость на роутере)."""

import logging
import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response

from ..security import get_current_user_id
from .gost import build_docx
from .models import ConvertRequest

log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/convert",
    tags=["convert"],
    dependencies=[Depends(get_current_user_id)],
)

MAX_MARKDOWN_CHARS = 2_000_000


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
    try:
        return build_docx(req.markdown, req.settings, req.assets)
    except Exception:
        log.exception("Conversion failed")
        raise HTTPException(status_code=500, detail="Не удалось сформировать DOCX")


@router.post("/docx")
def convert_docx(req: ConvertRequest) -> Response:
    return _attachment(
        _build_docx_checked(req),
        req.doc_name,
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
