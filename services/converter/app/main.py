import base64
import logging
import re
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, Response, UploadFile

from .gost import build_docx
from .models import ConvertRequest
from .pdf import docx_to_pdf, pdf_first_page_png

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = FastAPI(title="md2docx converter", version="1.0.0")

MAX_MARKDOWN_CHARS = 2_000_000


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


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


@app.post("/convert/docx")
def convert_docx(req: ConvertRequest) -> Response:
    return _attachment(
        _build_docx_checked(req),
        req.doc_name,
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


MAX_TITLE_FILE_BYTES = 20 * 1024 * 1024


@app.post("/convert/title-image")
async def title_image(file: UploadFile = File(...)) -> dict:
    """Первая страница пользовательского титульника (PDF/DOCX) → PNG data-URL.

    Фронт хранит картинку как ассет: превью показывает её первой страницей,
    а при экспорте она вставляется в документ полностраничной секцией.
    """
    data = await file.read()
    if len(data) > MAX_TITLE_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 20 МБ")
    name = (file.filename or "").lower()
    try:
        if name.endswith(".docx"):
            pdf = docx_to_pdf(data)
        elif name.endswith(".pdf") or data[:5] == b"%PDF-":
            pdf = data
        else:
            raise HTTPException(status_code=415, detail="Поддерживаются файлы PDF и DOCX")
        png = pdf_first_page_png(pdf)
    except HTTPException:
        raise
    except Exception:
        log.exception("Title image render failed")
        raise HTTPException(status_code=500, detail="Не удалось обработать титульный лист")
    return {"image": "data:image/png;base64," + base64.b64encode(png).decode()}


@app.post("/convert/pdf")
def convert_pdf(req: ConvertRequest) -> Response:
    """PDF-версия: тот же DOCX, дорендеренный LibreOffice'ом на сервере."""
    data = _build_docx_checked(req)
    try:
        pdf = docx_to_pdf(data)
    except Exception:
        log.exception("PDF conversion failed")
        raise HTTPException(status_code=500, detail="Не удалось сформировать PDF")
    return _attachment(pdf, req.doc_name, "pdf", "application/pdf")
