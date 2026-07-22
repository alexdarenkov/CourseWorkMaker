"""Резолвинг иллюстраций в готовом документе:

1) ```matplotlib-скрипты, которые написал ИИ, выполняются в песочнице;
2) внешние URL картинок (если разрешено) скачиваются SSRF-безопасно.

Оба варианта превращаются в ассеты `asset:fig-N` (data-URL), встроенные в
отчёт; неудавшиеся — в заглушку `![подпись](placeholder)`.
"""

from __future__ import annotations

import logging
import re

from .matplotlib_exec import png_to_data_url, run_matplotlib
from .web_images import fetch_image_data_url

log = logging.getLogger(__name__)

_MPL_BLOCK = re.compile(r"```matplotlib[ \t]*\n(.*?)\n```", re.DOTALL)
_FIG_CAPTION = re.compile(r"(?:^|\n)Рисунок:\s*([^\n]+)\s*$", re.IGNORECASE)
_WEB_IMG = re.compile(r"!\[([^\]]*)\]\((https?://[^)\s]+)\)")


def has_illustrations(document: str, run_scripts: bool, fetch_web: bool) -> bool:
    if run_scripts and "```matplotlib" in document:
        return True
    if fetch_web and _WEB_IMG.search(document):
        return True
    return False


def resolve_figures(
    document: str, run_scripts: bool = True, fetch_web: bool = False
) -> tuple[str, dict[str, str]]:
    """Выполняет/скачивает иллюстрации и встраивает их как ассеты."""
    assets: dict[str, str] = {}
    counter = [0]

    def _key(data_url: str) -> str:
        key = f"asset:fig-{counter[0]}"
        assets[key] = data_url
        counter[0] += 1
        return key

    def replace_script(m: re.Match) -> str:
        code = m.group(1)
        before = document[: m.start()]
        cap_m = _FIG_CAPTION.search(before)
        caption = cap_m.group(1).strip() if cap_m else "График"
        png = run_matplotlib(code)
        if png is None:
            log.info("script figure failed → placeholder")
            return f"![{caption}](placeholder)"
        return f"![{caption}]({_key(png_to_data_url(png))})"

    def replace_web(m: re.Match) -> str:
        caption = m.group(1).strip() or "Иллюстрация"
        url = m.group(2)
        data_url = fetch_image_data_url(url)
        if data_url is None:
            log.info("web image failed (%s) → placeholder", url)
            return f"![{caption}](placeholder)"
        return f"![{caption}]({_key(data_url)})"

    if run_scripts:
        document = _MPL_BLOCK.sub(replace_script, document)
    if fetch_web:
        document = _WEB_IMG.sub(replace_web, document)
    return document, assets
