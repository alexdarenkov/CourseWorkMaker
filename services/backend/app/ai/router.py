"""ИИ-агент: генерация и правка курсовой (маршруты /api/ai/*).

Логика — `agent.py`/`jobs.py`/`prompt_check.py`/`figures.py`, перенесены из
бывшего ai-сервиса без изменений. Аутентификация — JWT (замена gateway):
владелец задачи берётся из токена, а не из заголовка X-User-Id."""

import asyncio
import json
import logging
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, ValidationError

from ..security import get_current_user_id
from . import config
from .agent import CourseworkAgent, EditOptions, GenerationOptions
from .files import build_context
from .jobs import Job, store
from .prompt_check import analyze_prompt as run_prompt_analysis

log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/ai",
    tags=["ai"],
    dependencies=[Depends(get_current_user_id)],
)


@router.post("/generate")
async def generate(
    options: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> dict:
    uid = str(user_id)
    if not config.AI_API_KEY:
        raise HTTPException(503, "ИИ-сервис не сконфигурирован: задайте AI_API_KEY")
    try:
        opts = GenerationOptions.model_validate(json.loads(options))
    except (json.JSONDecodeError, ValidationError) as e:
        raise HTTPException(422, f"Некорректные параметры генерации: {e}")
    if store.has_active(uid):
        raise HTTPException(429, "У вас уже выполняется генерация — дождитесь завершения")
    if len(files) > config.MAX_FILES:
        raise HTTPException(413, f"Не более {config.MAX_FILES} файлов")

    uploads: list[tuple[str, bytes]] = []
    for f in files:
        data = await f.read()
        if len(data) > config.MAX_FILE_BYTES:
            raise HTTPException(413, f"Файл «{f.filename}» больше 15 МБ")
        uploads.append((f.filename or "file", data))

    job = store.create(uid)
    job.task = asyncio.create_task(_run_job(job, opts, uploads))
    return {"jobId": job.id}


class AnalyzePromptRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


@router.post("/analyze-prompt")
async def analyze_prompt(req: AnalyzePromptRequest) -> dict:
    """Валидация + разбор промпта генерации быстрой моделью: тема, требования
    и явно запрошенные элементы структуры (для авто-настройки тогглов на
    фронте). Fail-open: без ключа/при сбое промпт целиком становится темой."""
    if not config.AI_API_KEY:
        a = {"ok": True, "reason": None, "topic": req.text.strip()[:500], "requirements": ""}
    else:
        a = await run_prompt_analysis(req.text)
    # camelCase-алиасы для фронта (конвенция проекта).
    return {
        "ok": a["ok"],
        "reason": a.get("reason"),
        "topic": a.get("topic", ""),
        "requirements": a.get("requirements", ""),
        "targetPages": a.get("target_pages"),
        "includeTables": a.get("include_tables"),
        "includeDiagrams": a.get("include_diagrams"),
        "includeFormulas": a.get("include_formulas"),
        "includeImages": a.get("include_images"),
        "includeWebImages": a.get("include_web_images"),
        "includeCodeAppendix": a.get("include_code_appendix"),
        "includeBibliography": a.get("include_bibliography"),
    }


_pricing_cache: dict = {"ts": 0.0, "data": None}


@router.get("/pricing")
async def pricing() -> dict:
    """Цены настроенных уровней качества (₽ за миллион токенов, с кэшем)."""
    now = time.time()
    if _pricing_cache["data"] is None or now - _pricing_cache["ts"] > config.PRICING_CACHE_SECONDS:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{config.AI_BASE_URL}/models", params={"type": "chat"})
                resp.raise_for_status()
                models = {m["id"]: m for m in resp.json().get("data", [])}
        except Exception as e:
            if _pricing_cache["data"] is not None:
                return _pricing_cache["data"]
            raise HTTPException(503, f"Не удалось получить цены моделей: {e}")
        tiers = {}
        for tier, model_id in config.QUALITY_MODELS.items():
            tp = models.get(model_id, {}).get("top_provider", {})
            p = tp.get("pricing") or {}
            try:
                tiers[tier] = {
                    "promptPerMillion": float(p["prompt_per_million"]),
                    "completionPerMillion": float(p["completion_per_million"]),
                    "currency": p.get("currency", "RUB"),
                    "reasoning": "reasoning" in (tp.get("supported_parameters") or []),
                }
            except (KeyError, ValueError):
                tiers[tier] = None
        _pricing_cache.update(ts=now, data={"tiers": tiers})
    return _pricing_cache["data"]


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, user_id: uuid.UUID = Depends(get_current_user_id)) -> dict:
    job = store.get(job_id)
    if job is None or job.user_id != str(user_id):
        raise HTTPException(404, "Задача не найдена")
    if job.status in ("queued", "running") and job.task:
        job.task.cancel()
    return {"status": "cancelling"}


@router.post("/edit")
async def edit(opts: EditOptions, user_id: uuid.UUID = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    if not config.AI_API_KEY:
        raise HTTPException(503, "ИИ-сервис не сконфигурирован: задайте AI_API_KEY")
    if store.has_active(uid):
        raise HTTPException(429, "У вас уже выполняется задача — дождитесь завершения")

    job = store.create(uid)
    job.task = asyncio.create_task(_run_edit_job(job, opts))
    return {"jobId": job.id}


@router.get("/jobs/{job_id}")
def job_status(job_id: str, user_id: uuid.UUID = Depends(get_current_user_id)) -> dict:
    job = store.get(job_id)
    if job is None or job.user_id != str(user_id):
        raise HTTPException(404, "Задача не найдена")
    return {
        "id": job.id,
        "status": job.status,
        "stage": job.stage,
        "progress": round(job.progress, 3),
        "markdown": job.markdown,
        "partial": job.partial,
        "assets": job.assets,
        "error": job.error,
    }


async def _run_edit_job(job: Job, opts: EditOptions) -> None:
    agent = CourseworkAgent("balanced")
    await _run_agent_task(job, "Применение правок", lambda p: agent.edit(opts, p))


async def _run_agent_task(job: Job, start_stage: str, task) -> None:
    """Общий каркас job'а правки: прогресс, отмена, обработка ошибок."""
    job.status = "running"
    job.stage = start_stage
    try:

        async def progress(stage: str, value: float, partial: str | None = None) -> None:
            job.stage = stage
            job.progress = value
            if partial is not None:
                job.partial = partial

        job.markdown = await task(progress)
        job.status = "done"
        job.stage = "Готово"
        job.progress = 1.0
    except asyncio.CancelledError:
        job.status = "cancelled"
        job.stage = "Остановлено"
        raise
    except Exception as e:
        log.exception("Job %s failed", job.id)
        job.status = "error"
        job.stage = "Ошибка"
        job.error = str(e)


async def _run_job(
    job: Job, opts: GenerationOptions, uploads: list[tuple[str, bytes]]
) -> None:
    job.status = "running"
    try:
        if uploads:
            job.stage = "Анализ загруженных материалов"
            job.progress = 0.02
            context = await asyncio.to_thread(build_context, uploads)
        else:
            context = ""

        async def progress(stage: str, value: float, partial: str | None = None) -> None:
            job.stage = stage
            job.progress = value
            if partial is not None:
                job.partial = partial

        agent = CourseworkAgent(opts.quality)
        job.markdown = await agent.generate(opts, context, progress)
        job.assets = agent.assets
        job.status = "done"
        job.stage = "Готово"
        job.progress = 1.0
    except asyncio.CancelledError:
        job.status = "cancelled"
        job.stage = "Остановлено"
        raise
    except Exception as e:
        log.exception("Generation job %s failed", job.id)
        job.status = "error"
        job.stage = "Ошибка"
        job.error = str(e)
