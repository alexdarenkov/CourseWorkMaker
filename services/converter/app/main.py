import logging
import re
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Response

from .gost import build_docx
from .models import ConvertRequest

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = FastAPI(title="md2docx converter", version="1.0.0")

MAX_MARKDOWN_CHARS = 2_000_000


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/convert/docx")
def convert_docx(req: ConvertRequest) -> Response:
    if len(req.markdown) > MAX_MARKDOWN_CHARS:
        raise HTTPException(status_code=413, detail="Документ слишком большой")
    try:
        data = build_docx(req.markdown, req.settings, req.assets)
    except Exception:
        log.exception("Conversion failed")
        raise HTTPException(status_code=500, detail="Не удалось сформировать DOCX")

    safe_name = re.sub(r'[\\/:*?"<>|\r\n]+', "_", req.doc_name).strip() or "document"
    filename = quote(f"{safe_name}.docx")
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
        },
    )
