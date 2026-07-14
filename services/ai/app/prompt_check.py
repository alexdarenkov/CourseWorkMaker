"""Смысловая проверка промпта БЫСТРОЙ моделью перед запуском конвейера.

Фронтовые регэкспы ловят только длину и мусор из символов; осмысленность
(«qwerty asdf» vs «Фильтр Калмана в навигации») может оценить только модель.
Проверка дешёвая (короткий вызов fast-уровня, temperature=0, строгий JSON) и
fail-open: при любом сбое валидатора промпт пропускается — проверка не должна
блокировать работу сервиса.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage

from . import config

log = logging.getLogger(__name__)

PromptKind = Literal["topic", "edit"]

_SYSTEM_TOPIC = """Ты — проверяющий ввода для генератора курсовых работ. Оцени, является ли текст пользователя осмысленной ТЕМОЙ учебной/курсовой работы или отчёта (любая дисциплина, любой уровень детализации).

НЕ считается темой: бессмысленный набор букв или слов («фывафыва», «qwerty», «привет привет»), случайные символы, приветствия и болтовня с ботом, отдельные команды («скачай», «сделай красиво»), одни числа, оскорбления.

Ответь СТРОГО одним JSON-объектом без пояснений и без markdown:
{"ok": true}
или
{"ok": false, "reason": "<одно короткое предложение по-русски: что не так и как сформулировать тему>"}"""

_SYSTEM_EDIT = """Ты — проверяющий ввода для ИИ-редактора курсовой работы. Оцени, является ли текст пользователя осмысленной ИНСТРУКЦИЕЙ ПРАВКИ документа: что изменить, добавить, убрать, переписать, сократить, расширить и т. п.

НЕ считается инструкцией: бессмысленный набор букв или символов, приветствия и болтовня, вопросы не про документ, пустые фразы без сути («сделай нормально» — слишком пусто, непонятно ЧТО менять).

Ответь СТРОГО одним JSON-объектом без пояснений и без markdown:
{"ok": true}
или
{"ok": false, "reason": "<одно короткое предложение по-русски: что не так и как сформулировать правку>"}"""


def parse_verdict(raw: str) -> tuple[bool, str | None]:
    """Разбирает ответ модели. Любой непонятный ответ — fail-open (ok=True):
    валидатор не имеет права блокировать пользователя из-за своих сбоев."""
    m = re.search(r"\{.*\}", raw or "", re.S)
    if not m:
        return True, None
    try:
        data = json.loads(m.group(0))
    except (json.JSONDecodeError, ValueError):
        return True, None
    if not isinstance(data, dict):
        return True, None
    ok = data.get("ok")
    if not isinstance(ok, bool):
        return True, None
    reason = data.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        reason = None
    else:
        reason = reason.strip()[:300]
    return ok, (None if ok else reason)


_SYSTEM_ANALYZE = """Ты — приёмщик заявок генератора курсовых работ. Пользователь пишет ОДИН промпт, в котором может быть и тема работы, и требования (объём в страницах, что включить/исключить, пожелания методички).

Сначала оцени осмысленность: если это НЕ заявка на работу (бессмысленный набор букв, приветствие, болтовня, команда без темы) — верни:
{"ok": false, "reason": "<одно короткое предложение по-русски: что не так и как сформулировать>"}

Если заявка осмысленна — верни СТРОГО один JSON-объект без markdown и пояснений:
{"ok": true,
 "topic": "<краткая формулировка темы работы, до 400 символов, без слов «курсовая»/«напиши»>",
 "requirements": "<все остальные требования из промпта своими словами; пустая строка, если их нет>",
 "target_pages": <число 5..40, если пользователь указал объём, иначе null>,
 "include_tables": <true|false|null>,
 "include_diagrams": <true|false|null>,
 "include_formulas": <true|false|null>,
 "include_images": <true|false|null>,
 "include_web_images": <true|false|null>,
 "include_code_appendix": <true|false|null>,
 "include_bibliography": <true|false|null>}

Правила для include_*: true или false ТОЛЬКО если пользователь явно попросил или явно отказался; во всех остальных случаях null (останутся настройки по умолчанию).
- include_tables — таблицы; include_diagrams — mermaid-схемы/диаграммы; include_formulas — формулы;
- include_images — графики, которые построит Python (matplotlib); include_web_images — фотографии/картинки из интернета;
- include_code_appendix — приложение с листингами кода; include_bibliography — список литературы."""

# Поля-переключатели анализа (совпадают с GenerationOptions).
_TOGGLE_KEYS = (
    "include_tables",
    "include_diagrams",
    "include_formulas",
    "include_images",
    "include_web_images",
    "include_code_appendix",
    "include_bibliography",
)


def parse_analysis(raw: str, fallback_topic: str) -> dict:
    """Разбирает ответ анализа. Fail-open: непонятный ответ → промпт целиком
    становится темой, требования пустые, переключатели не трогаются."""
    fallback = {
        "ok": True,
        "reason": None,
        "topic": fallback_topic[:500],
        "requirements": "",
        "target_pages": None,
        **{k: None for k in _TOGGLE_KEYS},
    }
    m = re.search(r"\{.*\}", raw or "", re.S)
    if not m:
        return fallback
    try:
        data = json.loads(m.group(0))
    except (json.JSONDecodeError, ValueError):
        return fallback
    if not isinstance(data, dict) or not isinstance(data.get("ok"), bool):
        return fallback
    if not data["ok"]:
        reason = data.get("reason")
        reason = reason.strip()[:300] if isinstance(reason, str) and reason.strip() else None
        return {**fallback, "ok": False, "reason": reason}
    out = dict(fallback)
    topic = data.get("topic")
    if isinstance(topic, str) and topic.strip():
        out["topic"] = topic.strip()[:500]
    req = data.get("requirements")
    if isinstance(req, str):
        out["requirements"] = req.strip()[:8000]
    tp = data.get("target_pages")
    if isinstance(tp, (int, float)) and not isinstance(tp, bool):
        out["target_pages"] = max(5, min(40, int(tp)))
    for key in _TOGGLE_KEYS:
        val = data.get(key)
        if isinstance(val, bool):
            out[key] = val
    return out


async def analyze_prompt(text: str) -> dict:
    """Валидация + разбор промпта генерации: тема, требования, переключатели.
    Fail-open при сбоях (промпт становится темой как есть)."""
    from .agent import _build_llm

    fallback_topic = text.strip()
    try:
        llm = _build_llm(temperature=0.0, model=config.AI_MODEL_FAST)
        resp = await llm.ainvoke(
            [SystemMessage(content=_SYSTEM_ANALYZE), HumanMessage(content=text[:4000])]
        )
        content = resp.content if isinstance(resp.content, str) else str(resp.content)
        return parse_analysis(content, fallback_topic)
    except Exception:
        log.warning("Анализатор промпта недоступен — используем промпт как тему", exc_info=True)
        return parse_analysis("", fallback_topic)


async def check_prompt(kind: PromptKind, text: str) -> tuple[bool, str | None]:
    """Спрашивает быструю модель, осмыслен ли промпт. Fail-open при сбоях."""
    # Импорт здесь, а не на уровне модуля: parse_verdict остаётся тестируемым
    # без langchain_openai/сети (тесты чистой логики).
    from .agent import _build_llm

    try:
        llm = _build_llm(temperature=0.0, model=config.AI_MODEL_FAST)
        system = _SYSTEM_TOPIC if kind == "topic" else _SYSTEM_EDIT
        resp = await llm.ainvoke(
            [SystemMessage(content=system), HumanMessage(content=text[:2000])]
        )
        content = resp.content if isinstance(resp.content, str) else str(resp.content)
        return parse_verdict(content)
    except Exception:
        log.warning("Валидатор промпта недоступен — пропускаем без проверки", exc_info=True)
        return True, None
