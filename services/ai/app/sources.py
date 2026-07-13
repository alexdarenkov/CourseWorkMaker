"""Проверка ссылок в списке использованных источников.

Модели нередко галлюцинируют URL электронных ресурсов — для студента это
риск на защите. Проверяем доступность ссылок HEAD-запросом (SSRF-безопасно,
как в web_images) и возвращаем замечания для нормоконтроля.
"""

from __future__ import annotations

import asyncio
import logging
import re
from urllib.parse import urlparse

import httpx

from .agent import _bibliography_slice
from .web_images import USER_AGENT, _is_private_host

log = logging.getLogger(__name__)

CHECK_TIMEOUT_S = 6.0
MAX_URLS = 20

# URL до закрывающего пробела/скобки/кавычки; хвостовые знаки препинания срезаем.
_URL_RE = re.compile(r"https?://[^\s)\]>»«\"']+")


def bibliography_urls(document: str) -> list[str]:
    """URL из раздела «Список использованных источников» (без дублей, по порядку)."""
    bib = _bibliography_slice(document)
    if not bib:
        return []
    seen: dict[str, None] = {}
    for m in _URL_RE.finditer(bib):
        url = m.group(0).rstrip(".,;:")
        seen.setdefault(url, None)
    return list(seen)


async def _check_one(client: httpx.AsyncClient, url: str) -> str | None:
    """None — ссылка доступна, иначе текст замечания."""
    host = urlparse(url).hostname
    if not host:
        return f"Источник {url}: некорректный адрес"
    if await asyncio.to_thread(_is_private_host, host):
        return f"Источник {url}: адрес указывает на приватную сеть"
    try:
        resp = await client.head(url)
        # Часть серверов не поддерживает HEAD — считаем, что ресурс существует.
        if resp.status_code in (405, 501):
            return None
        if resp.status_code >= 400:
            return f"Источник {url}: сервер ответил {resp.status_code} — проверь ссылку"
        return None
    except httpx.HTTPError:
        return f"Источник {url}: не открылась при проверке — проверь ссылку вручную"


async def check_bibliography_urls(document: str) -> list[str]:
    """Проверяет доступность URL источников; замечания в формате линта."""
    urls = bibliography_urls(document)[:MAX_URLS]
    if not urls:
        return []
    async with httpx.AsyncClient(
        timeout=CHECK_TIMEOUT_S,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        results = await asyncio.gather(*(_check_one(client, u) for u in urls))
    return [r for r in results if r]
