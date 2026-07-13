"""In-memory хранилище задач генерации."""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field

from . import config


@dataclass
class Job:
    id: str
    user_id: str
    status: str = "queued"  # queued | running | done | error | cancelled
    stage: str = "В очереди"
    progress: float = 0.0
    markdown: str | None = None
    # Частичный документ по мере генерации (уже готовые разделы) — фронт
    # показывает его в предпросмотре; при отмене его можно забрать в редактор.
    partial: str | None = None
    assets: dict[str, str] = field(default_factory=dict)
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    task: asyncio.Task | None = None


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}

    def _cleanup(self) -> None:
        deadline = time.time() - config.JOB_TTL_SECONDS
        for job_id in [j.id for j in self._jobs.values() if j.created_at < deadline]:
            job = self._jobs.pop(job_id)
            if job.task and not job.task.done():
                job.task.cancel()

    def create(self, user_id: str) -> Job:
        self._cleanup()
        job = Job(id=uuid.uuid4().hex, user_id=user_id)
        self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        self._cleanup()
        return self._jobs.get(job_id)

    def has_active(self, user_id: str) -> bool:
        return any(
            j.user_id == user_id and j.status in ("queued", "running")
            for j in self._jobs.values()
        )


store = JobStore()
