"""ИИ-агент генерации курсовой работы (LangChain + OpenAI-совместимый прокси).

Конвейер:
1) план работы (структура по ГОСТ 7.32-2017) — строгий JSON с ретраем и
   программной нормализацией (порядок разделов, обязательные элементы);
2) пораздельная генерация markdown с бюджетом слов на раздел;
3) самопроверка: каждый раздел критикуется и исправляется отдельным вызовом
   «нормоконтролёра» (temperature=0) с защитой от деградации;
4) программная страховка структуры раздела: ровно один заголовок 1-го уровня;
5) линт собранного документа (структура, подписи, ссылки на источники,
   разрешённые иллюстрации) + финальная LLM-доводка при замечаниях;
6) построение иллюстраций (matplotlib-скрипты, картинки из интернета).

Чистая логика (нормализация плана, линт, работа с заголовками) вынесена в
функции уровня модуля — они тестируются без LLM (см. tests/).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import Awaitable, Callable
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field, ValidationError

from . import config
from .figures import has_illustrations, resolve_figures

log = logging.getLogger(__name__)

# progress(stage, value, partial=None): partial — готовая на данный момент часть
# документа (передаётся после завершения каждого раздела при генерации).
ProgressCb = Callable[..., Awaitable[None]]

# Температуры: автор пишет с лёгкой вариативностью, нормоконтролёр — детерминированно.
WRITER_TEMPERATURE = 0.4
CHECKER_TEMPERATURE = 0.0
LLM_TIMEOUT_S = 300

# Бюджет текста: ~230 слов на страницу ГОСТ (14 пт, полуторный интервал).
WORDS_PER_PAGE = 230
MIN_SECTION_WORDS = 350
# Введение и заключение короче содержательных разделов (доли от общего объёма).
INTRO_SHARE, INTRO_MIN, INTRO_MAX = 0.09, 250, 600
CONCL_SHARE, CONCL_MIN, CONCL_MAX = 0.07, 200, 500
# Страховка от «плана на 20 глав»: каждый раздел — отдельные вызовы модели.
MAX_CONTENT_SECTIONS = 8

# Пределы читаемости на листе А4: шире/крупнее — контент физически не помещается
# или становится нечитаемым после вписывания в страницу.
MAX_TABLE_COLS = 8
MAX_MERMAID_LINES = 20

# Сколько раз запрашиваем план, если модель вернула битый JSON/пустую структуру.
OUTLINE_ATTEMPTS = 2


class GenerationOptions(BaseModel):
    topic: str = Field(min_length=3, max_length=500)
    requirements: str = Field(default="", max_length=8000)
    target_pages: int = Field(default=15, ge=5, le=60)
    quality: Literal["fast", "balanced", "quality"] = "balanced"
    include_bibliography: bool = True
    include_tables: bool = True
    include_diagrams: bool = True
    include_formulas: bool = False
    include_images: bool = False
    include_web_images: bool = False
    include_code_appendix: bool = False


class EditOptions(BaseModel):
    instruction: str = Field(min_length=3, max_length=4000)
    markdown: str = Field(min_length=1, max_length=300_000)


class SectionEditOptions(BaseModel):
    """Правка ОДНОГО раздела: дешевле и безопаснее, чем переписывать весь документ."""

    instruction: str = Field(min_length=3, max_length=4000)
    section_title: str = Field(min_length=1, max_length=300)
    markdown: str = Field(min_length=1, max_length=300_000)


class OutlineSection(BaseModel):
    title: str
    subsections: list[str] = []


class Outline(BaseModel):
    sections: list[OutlineSection]


MD_DIALECT = """Диалект Markdown редактора (соблюдай строго):
- Разделы основной части: `# Название раздела` (БЕЗ номера — нумерация проставляется автоматически).
- Структурные элементы: `# Введение`, `# Заключение`, `# Список использованных источников` — ровно с такими названиями.
- Подразделы: `## Название`, пункты: `### Название` (тоже без номеров).
- Перед таблицей отдельной строкой подпись: `Таблица: Название таблицы`, затем GFM-таблица через `|`.
- Таблицы — НЕ ШИРЕ 6 колонок (лист А4 вмещает читаемо только это); если данных больше — разбей на несколько таблиц или поменяй строки и столбцы местами.
- Перед mermaid-схемой или изображением отдельной строкой: `Рисунок: Название рисунка`.
- Mermaid-схемы: блок ```mermaid с простым flowchart/sequenceDiagram (без стилей, без кавычек внутри узлов), не более 12 узлов с подписями в 1–3 слова — крупные схемы становятся нечитаемыми при вписывании в лист.
- Блоки ```matplotlib (если есть) — это графики, СОХРАНЯЙ их дословно, не превращай в ```python и не удаляй.
- Формулы: выключные `$$ ... $$` (LaTeX), в тексте `$ ... $`. Пояснения значений символов — после формулы со слова «где».
- Список литературы: нумерованный список `1.`, `2.` … в разделе `# Список использованных источников`, оформление по ГОСТ.
- Маркированные списки через `-`, в конце пунктов `;`, последний — `.`.
- Жирный `**…**` только для ключевых терминов, курсив `*…*` — умеренно.
- НЕ используй HTML, сноски, чек-боксы, заголовки 4+ уровня, эмодзи."""

STYLE_RULES = """Требования к тексту:
- Научный стиль изложения, безличные конструкции («в работе рассмотрено…», «было выполнено…»).
- Запрещены разговорные обороты, обращения к читателю и упоминания ИИ.
- Введение: актуальность, цель, задачи (нумерованный список), объект и предмет исследования.
- Заключение: выводы по задачам, оценка полноты решений.
- Связный, содержательный текст без «воды»; на источники указывай в тексте в квадратных скобках [1], [2] — номера должны соответствовать списку литературы."""


# ---------- классификация разделов ----------

def _norm_title(title: str) -> str:
    return title.strip().lower()


def is_intro(title: str) -> bool:
    return _norm_title(title) == "введение"


def is_conclusion(title: str) -> bool:
    return _norm_title(title) == "заключение"


def is_bibliography(title: str) -> bool:
    return _norm_title(title).startswith("список")


def is_appendix(title: str) -> bool:
    return _norm_title(title).startswith("приложени")


def is_structural(title: str) -> bool:
    """Структурный элемент ГОСТ (не содержательный раздел основной части)."""
    return is_intro(title) or is_conclusion(title) or is_bibliography(title) or is_appendix(title)


# ---------- чистые функции конвейера (тестируются без LLM) ----------

def normalize_outline(outline: Outline, opts: GenerationOptions) -> Outline:
    """Приводит план модели к канонической структуре ГОСТ.

    Порядок: Введение → содержательные разделы → Заключение → Список
    использованных источников → Приложение. Недостающие структурные элементы
    добавляются, отключённые настройками — удаляются, у структурных элементов
    убираются подразделы, избыток содержательных разделов обрезается.
    """
    body = [s for s in outline.sections if not is_structural(s.title)]
    body = body[:MAX_CONTENT_SECTIONS]

    sections = [OutlineSection(title="Введение")]
    sections.extend(body)
    sections.append(OutlineSection(title="Заключение"))
    if opts.include_bibliography:
        sections.append(OutlineSection(title="Список использованных источников"))
    if opts.include_code_appendix:
        sections.append(OutlineSection(title="Приложение А. Листинг кода"))
    return Outline(sections=sections)


def ensure_single_heading(text: str, title: str) -> str:
    """Страхует структуру фрагмента раздела.

    Гарантирует, что фрагмент начинается с заголовка 1-го уровня (для
    структурных элементов — ровно `# {title}`, чтобы их распознали оба
    рендера), а все ПОСЛЕДУЮЩИЕ `#` понижает до `##`: иначе раздел
    «расщепился» бы на несколько и сбил сквозную нумерацию по плану.
    Заголовки внутри фенсед-кода не трогаем.
    """
    t = text.strip()
    lines = t.split("\n")
    out: list[str] = []
    seen_h1 = False
    in_code = False
    for line in lines:
        if line.strip().startswith("```"):
            in_code = not in_code
            out.append(line)
            continue
        if not in_code and re.match(r"^#\s", line):
            if not seen_h1:
                seen_h1 = True
                if is_structural(title):
                    line = f"# {title}"
            else:
                line = "#" + line
        out.append(line)
    result = "\n".join(out)
    if not seen_h1:
        result = f"# {title}\n\n{result}"
    return result


def section_word_target(opts: GenerationOptions, outline: Outline, section: OutlineSection) -> int:
    """Бюджет слов раздела: введение/заключение короче, остальной объём делится
    поровну между содержательными разделами (список и приложение не в счёт)."""
    total = opts.target_pages * WORDS_PER_PAGE
    intro = min(max(int(total * INTRO_SHARE), INTRO_MIN), INTRO_MAX)
    concl = min(max(int(total * CONCL_SHARE), CONCL_MIN), CONCL_MAX)
    if is_intro(section.title):
        return intro
    if is_conclusion(section.title):
        return concl
    body_count = sum(1 for s in outline.sections if not is_structural(s.title))
    return max(MIN_SECTION_WORDS, (total - intro - concl) // max(body_count, 1))


def _bibliography_slice(document: str) -> str | None:
    """Текст раздела списка источников (до следующего `#`) или None."""
    m = re.search(r"^# Список[^\n]*$", document, re.MULTILINE | re.IGNORECASE)
    if not m:
        return None
    tail = document[m.end():]
    nxt = re.search(r"^# ", tail, re.MULTILINE)
    return tail[: nxt.start()] if nxt else tail


def _lint_citations(document: str) -> list[str]:
    """Ссылки [N] в тексте должны существовать и попадать в диапазон списка."""
    bib = _bibliography_slice(document)
    if bib is None:
        return []
    n_sources = len(re.findall(r"^\d+[.)]\s", bib, re.MULTILINE))
    body = document[: document.lower().find("# список")]
    # (?!\() — не путать со ссылкой markdown `[1](url)`.
    cited = [int(x) for x in re.findall(r"\[(\d{1,3})\](?!\()", body)]
    issues: list[str] = []
    if n_sources and not cited:
        issues.append(
            "В тексте нет ссылок на источники — расставь [1], [2], … в местах, "
            "где используются материалы из списка литературы"
        )
    elif cited and n_sources and max(cited) > n_sources:
        issues.append(
            f"В тексте есть ссылка [{max(cited)}], а в списке только "
            f"{n_sources} источников — приведи номера в соответствие"
        )
    return issues


def _lint_captions(document: str) -> list[str]:
    """Перед таблицей — «Таблица: …», перед mermaid-схемой — «Рисунок: …»."""
    issues: list[str] = []
    lines = document.split("\n")

    def prev_meaningful(idx: int) -> str:
        return next((l.strip() for l in reversed(lines[:idx]) if l.strip()), "")

    in_code = False
    for i, line in enumerate(lines):
        t = line.strip()
        if t.startswith("```"):
            if not in_code and t.startswith("```mermaid"):
                if not re.match(r"^Рисунок:", prev_meaningful(i), re.IGNORECASE):
                    issues.append(
                        f"Перед mermaid-схемой нет подписи «Рисунок: …» (строка {i + 1})"
                    )
                    break
            in_code = not in_code
    in_code = False
    for i, line in enumerate(lines):
        t = line.strip()
        if t.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not t.startswith("|") or i == 0:
            continue
        prev = prev_meaningful(i)
        if not (prev.startswith("|") or re.match(r"^Таблица:", prev, re.IGNORECASE)):
            issues.append(f"Перед таблицей нет подписи «Таблица: …» (строка {i + 1})")
            break
    return issues


def _lint_oversized(document: str) -> list[str]:
    """Таблицы шире листа и mermaid-схемы, нечитаемые после вписывания в страницу.

    Вёрстка такое не спасает (даже Word): чинится только содержание — разбить
    таблицу, транспонировать, упростить схему.
    """
    issues: list[str] = []
    in_code = False
    table_reported = False
    for line in document.split("\n"):
        t = line.strip()
        if t.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not t.startswith("|") or table_reported:
            continue
        cols = len(t.strip("|").split("|"))
        if cols > MAX_TABLE_COLS:
            issues.append(
                f"Таблица в {cols} колонок не поместится на лист читаемо — разбей её "
                "на несколько таблиц или поменяй строки и столбцы местами"
            )
            table_reported = True
    for m in re.finditer(r"```mermaid[ \t]*\n(.*?)\n```", document, re.DOTALL):
        n_lines = sum(1 for l in m.group(1).split("\n") if l.strip())
        if n_lines > MAX_MERMAID_LINES:
            issues.append(
                f"Mermaid-схема из {n_lines} строк станет нечитаемой после вписывания "
                "в лист — упрости её или разбей на несколько схем"
            )
            break
    return issues


def lint_document(document: str, opts: GenerationOptions) -> list[str]:
    """Программная проверка собранного документа. Возвращает список замечаний,
    которые затем исправляет LLM-нормоконтролёр (см. _final_fix)."""
    issues: list[str] = []
    if not re.search(r"^# Введение\s*$", document, re.MULTILINE | re.IGNORECASE):
        issues.append("Отсутствует раздел «# Введение»")
    if not re.search(r"^# Заключение\s*$", document, re.MULTILINE | re.IGNORECASE):
        issues.append("Отсутствует раздел «# Заключение»")
    if opts.include_bibliography and not re.search(
        r"^# Список использованных источников\s*$", document, re.MULTILINE | re.IGNORECASE
    ):
        issues.append("Отсутствует раздел «# Список использованных источников»")

    issues.extend(_lint_captions(document))
    issues.extend(_lint_citations(document))
    issues.extend(_lint_oversized(document))

    has_url_img = bool(re.search(r"!\[[^\]]*\]\(https?://", document))
    has_local_img = bool(re.search(r"!\[[^\]]*\]\((?!https?://|placeholder)", document))
    has_mpl = "```matplotlib" in document
    # Внешние URL допустимы только при включённой загрузке из интернета.
    if has_url_img and not opts.include_web_images:
        issues.append(
            "Использованы внешние URL изображений — включи загрузку картинок из "
            "интернета или построй график блоком ```matplotlib"
        )
    # matplotlib-блоки допустимы только при включённых графиках ИИ.
    if has_mpl and not opts.include_images:
        issues.append("Блоки ```matplotlib запрещены настройками — убери их")
    # «Голые» `![…](…)` без http — модель не должна выдумывать локальные пути.
    if has_local_img:
        issues.append("Не вставляй `![…](локальный-путь)` — только график ```matplotlib или URL")
    if not opts.include_formulas and re.search(r"^\s*\$\$", document, re.MULTILINE):
        issues.append("Выключные формулы $$…$$ отключены настройками — перепиши текстом")
    if re.search(r"^#{4,}\s", document, re.MULTILINE):
        issues.append("Использованы заголовки 4-го уровня и глубже — замени на ###")
    if re.search(r"^#{1,3}\s+\d", document, re.MULTILINE):
        issues.append("Заголовки содержат ручные номера (1, 4.3, …) — убери их, нумерация автоматическая")
    return issues


def split_sections(document: str) -> list[tuple[str | None, str]]:
    """Режет документ по заголовкам 1-го уровня (вне код-фенсов).

    Возвращает [(заголовок, текст-раздела-с-заголовком), …]; у преамбулы до
    первого `#` заголовок None.
    """
    parts: list[tuple[str | None, str]] = []
    cur_title: str | None = None
    cur: list[str] = []
    in_code = False
    for line in document.split("\n"):
        if line.strip().startswith("```"):
            in_code = not in_code
        m = None if in_code else re.match(r"^#\s+(.+?)\s*$", line)
        if m:
            if cur or cur_title is not None:
                parts.append((cur_title, "\n".join(cur)))
            cur_title = m.group(1)
            cur = [line]
        else:
            cur.append(line)
    parts.append((cur_title, "\n".join(cur)))
    return parts


def replace_section(document: str, title: str, new_text: str) -> str:
    """Заменяет раздел с заголовком `title` на `new_text` (регистронезависимо).

    Бросает ValueError, если раздела нет. Между разделами нормализуется одна
    пустая строка — как их и собирает генерация.
    """
    wanted = title.strip().lower()
    out: list[str] = []
    replaced = False
    for t, text in split_sections(document):
        if not replaced and t is not None and t.strip().lower() == wanted:
            out.append(new_text.strip())
            replaced = True
        else:
            out.append(text.strip("\n"))
    if not replaced:
        raise ValueError(f"Раздел «{title}» не найден в документе")
    return "\n\n".join(p for p in out if p.strip())


def lint_user_document(document: str) -> list[str]:
    """Нормоконтроль документа пользователя (кнопка «Проверить» в редакторе).

    В отличие от lint_document, не знает настроек генерации и не ограничивает
    иллюстрации: проверяются только требования оформления, которые пользователь
    может нарушить в своём тексте. Работает без LLM и без AI_API_KEY.
    """
    issues: list[str] = []
    if not re.search(r"^# Введение\s*$", document, re.MULTILINE | re.IGNORECASE):
        issues.append("Нет раздела «# Введение» — по ГОСТ 7.32-2017 он обязателен")
    if not re.search(r"^# Заключение\s*$", document, re.MULTILINE | re.IGNORECASE):
        issues.append("Нет раздела «# Заключение» — по ГОСТ 7.32-2017 он обязателен")
    if not re.search(r"^# Список", document, re.MULTILINE | re.IGNORECASE):
        issues.append("Нет раздела «# Список использованных источников»")
    issues.extend(_lint_captions(document))
    issues.extend(_lint_citations(document))
    issues.extend(_lint_oversized(document))
    if re.search(r"^#{4,}\s", document, re.MULTILINE):
        issues.append("Заголовки 4-го уровня и глубже не нумеруются по ГОСТ — будут показаны как уровень 3")
    if re.search(r"^#{1,3}\s+\d", document, re.MULTILINE):
        issues.append("В заголовках есть ручные номера — они будут срезаны, нумерация автоматическая")
    if "```matplotlib" in document:
        issues.append(
            "Блок ```matplotlib — служебный формат ИИ-генерации: в превью и DOCX "
            "он попадёт как листинг кода, а не как график"
        )
    return issues


def strip_fences(text: str) -> str:
    """Срезает обрамляющий ```markdown-фенс, если модель завернула в него ответ."""
    t = text.strip()
    m = re.match(r"^```(?:markdown|md)?\s*\n(.*)\n```$", t, re.DOTALL)
    return m.group(1).strip() if m else t


def extract_json(text: str) -> dict:
    """Достаёт JSON-объект из ответа модели (с фенсом или без)."""
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    payload = m.group(1) if m else text
    start = payload.find("{")
    end = payload.rfind("}")
    if start < 0 or end <= start:
        raise ValueError(f"Ответ модели не содержит JSON: {text[:200]}")
    return json.loads(payload[start : end + 1])


def summarize_section(text: str) -> str:
    """Короткая выжимка раздела для контекста следующих: подразделы + начало."""
    subheads = re.findall(r"^##\s+(.+)$", text, re.MULTILINE)
    plain = re.sub(r"[#*`$|]", "", text)
    head = " ".join(plain.split()[:50])
    parts = []
    if subheads:
        parts.append("подразделы: " + ", ".join(subheads[:6]))
    parts.append(head + "…")
    return "; ".join(parts)


# ---------- агент ----------

def _build_llm(temperature: float, model: str) -> ChatOpenAI:
    if not config.AI_API_KEY:
        raise RuntimeError("AI_API_KEY не задан — ИИ-сервис не сконфигурирован")
    return ChatOpenAI(
        model=model,
        base_url=config.AI_BASE_URL,
        api_key=config.AI_API_KEY,
        temperature=temperature,
        timeout=LLM_TIMEOUT_S,
        max_retries=2,
    )


class CourseworkAgent:
    def __init__(self, quality: str = "balanced") -> None:
        model = config.QUALITY_MODELS.get(quality, config.AI_MODEL_BALANCED)
        self.llm = _build_llm(temperature=WRITER_TEMPERATURE, model=model)
        self.checker = _build_llm(temperature=CHECKER_TEMPERATURE, model=model)
        # Картинки-ассеты (PNG-графики), сгенерированные при выполнении скриптов.
        self.assets: dict[str, str] = {}

    async def generate(
        self,
        opts: GenerationOptions,
        source_context: str,
        progress: ProgressCb,
    ) -> str:
        await progress("Составление плана работы", 0.05)
        outline = await self._make_outline(opts, source_context)

        total = len(outline.sections)
        body_parts: list[str] = []
        running_summary = ""
        for idx, section in enumerate(outline.sections):
            base = 0.10 + 0.70 * idx / total
            await progress(f"Раздел {idx + 1}/{total}: «{section.title}»", base)

            # Стриминг черновика: partial = готовые разделы + растущий текст
            # текущего (фронт показывает «печать» вживую). Троттлинг ~0.4 с,
            # чтобы не заливать job-store на каждый токен.
            last_push = 0.0
            done_parts = "\n\n".join(body_parts)

            async def on_chunk(acc: str) -> None:
                nonlocal last_push
                now = time.monotonic()
                if now - last_push < 0.4:
                    return
                last_push = now
                await progress(
                    f"Раздел {idx + 1}/{total}: «{section.title}»",
                    base,
                    (done_parts + "\n\n" + acc).strip(),
                )

            draft = await self._write_section(
                opts, source_context, outline, section, running_summary, on_chunk
            )
            await progress(
                f"Раздел {idx + 1}/{total}: самопроверка", base + 0.45 / total
            )
            checked = await self._self_check_section(section, draft)
            final = ensure_single_heading(checked, section.title)
            body_parts.append(final.strip())
            running_summary += f"\n— {section.title}: {summarize_section(final)}"
            # Готовые разделы сразу видны пользователю (предпросмотр в модалке);
            # при отмене их можно забрать в редактор.
            await progress(
                f"Раздел {idx + 1}/{total}: готов",
                base + 0.70 / total,
                "\n\n".join(body_parts),
            )

        document = "\n\n".join(body_parts)
        await progress("Финальная проверка документа", 0.82)
        issues = lint_document(document, opts)
        if issues:
            log.info("Линт нашёл замечания: %s", "; ".join(issues))
            await progress("Исправление замечаний", 0.88)
            document = await self._final_fix(document, issues)
            leftover = lint_document(document, opts)
            if leftover:
                # Не зацикливаемся на доводке: остаток замечаний только логируем.
                log.warning("После доводки остались замечания: %s", "; ".join(leftover))

        # Выполняем matplotlib-скрипты и/или скачиваем картинки из интернета.
        if has_illustrations(document, opts.include_images, opts.include_web_images):
            await progress("Построение иллюстраций", 0.94)
            document, self.assets = await asyncio.to_thread(
                resolve_figures, document, opts.include_images, opts.include_web_images
            )
        return document.strip() + "\n"

    async def edit(self, opts: EditOptions, progress: ProgressCb) -> str:
        """Правка готового документа по свободной инструкции пользователя."""
        await progress("Применение правок к документу", 0.15)
        system = f"""Ты — редактор курсовых работ. Тебе дан markdown-документ и запрос студента.
Выполни ТОЛЬКО то, что просит студент, не переписывая остальной текст без необходимости.
{MD_DIALECT}

{STYLE_RULES}

Верни ПОЛНЫЙ итоговый markdown документа целиком (включая неизменённые части),
без комментариев, пояснений и обрамляющих ```."""
        user = f"Запрос студента: {opts.instruction}\n\nДокумент:\n{opts.markdown}"
        resp = await self.checker.ainvoke(
            [SystemMessage(content=system), HumanMessage(content=user)]
        )
        await progress("Проверка результата", 0.9)
        fixed = strip_fences(resp.content)
        if not fixed.strip():
            raise ValueError("Модель вернула пустой документ — правка не применена")
        return fixed.strip() + "\n"

    async def edit_section(self, opts: SectionEditOptions, progress: ProgressCb) -> str:
        """Переписывает один раздел документа по инструкции пользователя.

        Модели отправляется только план (заголовки) и текст целевого раздела —
        это в разы дешевле правки всего документа и не даёт модели «улучшить»
        соседние разделы. Результат подшивается на место программно.
        """
        sections = split_sections(opts.markdown)
        wanted = opts.section_title.strip().lower()
        target = next(
            (text for t, text in sections if t is not None and t.strip().lower() == wanted),
            None,
        )
        if target is None:
            raise ValueError(f"Раздел «{opts.section_title}» не найден в документе")
        plan = "\n".join(f"- {t}" for t, _ in sections if t is not None)

        await progress(f"Правка раздела «{opts.section_title}»", 0.2)
        system = f"""Ты — редактор курсовых работ. Тебе дан ОДИН раздел работы и запрос студента.
Перепиши только этот раздел согласно запросу, сохраняя его роль в структуре работы.
{MD_DIALECT}

{STYLE_RULES}

Верни ТОЛЬКО итоговый markdown раздела целиком, начиная со строки `# {opts.section_title}`,
без комментариев и без обрамляющих ```."""
        user = f"""Полный план работы (для контекста, эти разделы не трогай):
{plan}

Запрос студента: {opts.instruction}

Текущий текст раздела:
{target}"""
        resp = await self.checker.ainvoke(
            [SystemMessage(content=system), HumanMessage(content=user)]
        )
        await progress("Сборка документа", 0.85)
        fixed = ensure_single_heading(strip_fences(resp.content), opts.section_title)
        if len(fixed.strip()) < 20:
            raise ValueError("Модель вернула пустой раздел — правка не применена")
        return replace_section(opts.markdown, opts.section_title, fixed).strip() + "\n"

    # ---------- шаги ----------

    async def _make_outline(self, opts: GenerationOptions, context: str) -> Outline:
        """План работы: строгий JSON, ретрай на битый ответ, нормализация."""
        sections_hint = max(3, min(6, opts.target_pages // 5 + 2))
        system = (
            "Ты — методист вуза, проектируешь структуру курсовой работы "
            "по ГОСТ 7.32-2017. Отвечай ТОЛЬКО JSON без пояснений."
        )
        user = f"""Тема курсовой работы: «{opts.topic}»
Дополнительные требования студента: {opts.requirements or "нет"}
Целевой объём: ~{opts.target_pages} страниц.
{"Материалы студента (используй их при планировании):" + chr(10) + context if context else ""}

Составь план: «Введение», {sections_hint - 2}–{sections_hint} содержательных раздела
(каждый с 2–4 подразделами), «Заключение»{", «Список использованных источников»" if opts.include_bibliography else ""}.
Названия разделов — без номеров.

Формат ответа:
{{"sections": [{{"title": "Введение", "subsections": []}}, {{"title": "...", "subsections": ["...", "..."]}}, ...]}}"""
        messages = [SystemMessage(content=system), HumanMessage(content=user)]

        last_error: Exception | None = None
        for attempt in range(OUTLINE_ATTEMPTS):
            resp = await self.llm.ainvoke(messages)
            try:
                outline = normalize_outline(
                    Outline.model_validate(extract_json(resp.content)), opts
                )
            except (ValueError, ValidationError) as e:
                last_error = e
                log.warning("Попытка %d: план не разобран (%s)", attempt + 1, e)
                continue
            if any(not is_structural(s.title) for s in outline.sections):
                return outline
            last_error = ValueError("План не содержит содержательных разделов")
            log.warning("Попытка %d: %s", attempt + 1, last_error)
        raise ValueError(f"Не удалось получить план работы: {last_error}")

    async def _write_section(
        self,
        opts: GenerationOptions,
        context: str,
        outline: Outline,
        section: OutlineSection,
        running_summary: str,
        on_chunk: Callable[[str], Awaitable[None]] | None = None,
    ) -> str:
        plan = "\n".join(
            f"- {s.title}" + (f" ({', '.join(s.subsections)})" if s.subsections else "")
            for s in outline.sections
        )
        words = section_word_target(opts, outline, section)

        # Дополнительные элементы (таблицы/схемы/формулы/графики) — только в
        # содержательных разделах, не во введении/заключении/списке/приложении.
        features: list[str] = []
        if not is_structural(section.title):
            if opts.include_tables:
                features.append("при уместности добавь 1 таблицу с подписью «Таблица: …»")
            if opts.include_diagrams:
                features.append("при уместности добавь 1 mermaid-схему с подписью «Рисунок: …»")
            if opts.include_formulas:
                features.append("при уместности добавь выключную формулу $$…$$ с пояснением «где …»")
            if opts.include_images:
                features.append(
                    "при уместности построй 1 график по реалистичным данным: отдельной "
                    "строкой «Рисунок: Название», затем блок ```matplotlib со скриптом"
                )
            if opts.include_web_images:
                features.append(
                    "при уместности добавь 1 реальную картинку из интернета: отдельной "
                    "строкой «Рисунок: Название», затем `![Название](прямой-URL-картинки)`"
                )

        if is_bibliography(section.title):
            task = (
                "Составь список из 8–15 реалистичных источников по теме "
                "(учебники, статьи, стандарты, электронные ресурсы) с оформлением по ГОСТ. "
                "Электронные ресурсы — с URL и датой обращения. Количество источников "
                "должно покрывать все ссылки [N], встречающиеся в написанных разделах."
            )
        elif is_appendix(section.title):
            task = (
                "Приведи 1–3 листинга кода, относящегося к теме работы (ключевые "
                "алгоритмы/функции/классы). Перед каждым листингом — короткая строка-"
                "пояснение что это. Код помещай в блоки ```python (или ```sql/```java — "
                "по уместному языку). Без длинного текста, только пояснения и листинги."
            )
        else:
            task = f"Напиши ПОЛНЫЙ текст этого раздела (~{words} слов). " + " ".join(features)

        img_lines = []
        if opts.include_images:
            img_lines.append(
                "Графики по данным: строка «Рисунок: Название», затем блок ```matplotlib "
                "с Python-скриптом. Доступны plt и np (уже импортированы). Бери реалистичные "
                "данные прямо в скрипте, подписывай оси и заголовок по-русски, вызывай "
                "plt.plot/bar/pie и т. п., НЕ вызывай plt.show()/plt.savefig() — сохраним сами."
            )
        if opts.include_web_images:
            img_lines.append(
                "Реальные фото/иллюстрации из интернета: строка «Рисунок: Название», затем "
                "`![Название](URL)`. Используй ТОЛЬКО надёжные прямые ссылки на файл картинки "
                "(оканчиваются на .jpg/.png), лучше всего с upload.wikimedia.org. "
                "Если не уверен, что ссылка рабочая, — лучше не вставляй."
            )
        if img_lines:
            img_rule = "Иллюстрации:\n" + "\n".join("- " + line for line in img_lines)
        else:
            img_rule = "- НЕ вставляй изображения `![…](…)` и блоки matplotlib — иллюстрации только mermaid-схемами."
        system = f"""Ты — опытный автор научных работ. Пишешь курсовую работу на русском языке.
{MD_DIALECT}
{img_rule}

{STYLE_RULES}"""
        user = f"""Тема: «{opts.topic}»
Требования студента: {opts.requirements or "нет"}
Полный план работы:
{plan}
{"Краткое содержание уже написанных разделов:" + running_summary if running_summary else ""}
{"Материалы студента:" + chr(10) + context if context else ""}

Сейчас напиши ТОЛЬКО раздел «{section.title}»{" с подразделами: " + ", ".join(section.subsections) if section.subsections else ""}.
{task}

Начни ровно со строки `# {section.title}`. Внутри раздела не используй других
заголовков `#` 1-го уровня. Верни только markdown, без пояснений и без обрамляющих ```."""
        messages = [SystemMessage(content=system), HumanMessage(content=user)]
        # Стриминг: черновик раздела виден пользователю по мере печати модели
        # (on_chunk получает НАКОПЛЕННЫЙ текст). Если прокси/модель не умеет
        # стримить — падаем обратно на обычный вызов.
        if on_chunk is not None:
            try:
                acc: list[str] = []
                async for part in self.llm.astream(messages):
                    text = part.content if isinstance(part.content, str) else ""
                    if text:
                        acc.append(text)
                        await on_chunk("".join(acc))
                if acc:
                    return strip_fences("".join(acc))
                log.warning("Стриминг вернул пустой ответ — повторяем без стриминга")
            except Exception:
                log.warning("Стриминг не удался — повторяем без стриминга", exc_info=True)
        resp = await self.llm.ainvoke(messages)
        return strip_fences(resp.content)

    async def _self_check_section(self, section: OutlineSection, draft: str) -> str:
        system = f"""Ты — строгий нормоконтролёр курсовых работ. Проверь фрагмент markdown и верни ИСПРАВЛЕННУЮ версию.
{MD_DIALECT}

Проверь и исправь:
1. Раздел начинается с `# {section.title}`, заголовки без номеров.
2. Подписи «Таблица: …» / «Рисунок: …» стоят отдельной строкой ПЕРЕД таблицей/схемой/картинкой.
3. Корректность mermaid-синтаксиса и LaTeX-формул.
4. Научный стиль, отсутствие упоминаний ИИ и обращений к читателю.
5. Связность и отсутствие оборванных предложений.

Верни ТОЛЬКО исправленный markdown целиком, без комментариев и без обрамляющих ```."""
        resp = await self.checker.ainvoke(
            [SystemMessage(content=system), HumanMessage(content=draft)]
        )
        fixed = strip_fences(resp.content)
        # Защита от деградации: если проверяющий вернул подозрительно мало —
        # оставляем черновик (модель могла «сжать» раздел или вернуть отписку).
        return fixed if len(fixed) > len(draft) * 0.5 else draft

    async def _final_fix(self, document: str, issues: list[str]) -> str:
        if len(document) > 120_000:
            log.warning("Документ слишком большой для финальной доводки, пропускаю")
            return document
        system = f"""Ты — нормоконтролёр. Исправь в документе перечисленные замечания, не меняя остальной текст.
{MD_DIALECT}

Верни ТОЛЬКО полный исправленный markdown."""
        user = "Замечания:\n" + "\n".join(f"- {i}" for i in issues) + "\n\nДокумент:\n" + document
        resp = await self.checker.ainvoke(
            [SystemMessage(content=system), HumanMessage(content=user)]
        )
        fixed = strip_fences(resp.content)
        return fixed if len(fixed) > len(document) * 0.6 else document
