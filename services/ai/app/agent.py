"""ИИ-агент генерации курсовой работы (LangChain + Kimi).

Конвейер:
1) план работы (структура по ГОСТ 7.32-2017) — JSON;
2) пораздельная генерация markdown;
3) самопроверка: каждый раздел критикуется и исправляется отдельным вызовом;
4) программный линт собранного документа + финальная LLM-доводка при проблемах.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

import asyncio

from . import config
from .figures import has_illustrations, resolve_figures

log = logging.getLogger(__name__)

ProgressCb = Callable[[str, float], Awaitable[None]]


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
- Перед mermaid-схемой или изображением отдельной строкой: `Рисунок: Название рисунка`.
- Mermaid-схемы: блок ```mermaid с простым flowchart/sequenceDiagram (без стилей, без кавычек внутри узлов).
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
- Связный, содержательный текст без «воды»; на ссылки на источники указывай в тексте в квадратных скобках [1], [2] — номера должны соответствовать списку литературы."""


def _build_llm(temperature: float, model: str) -> ChatOpenAI:
    if not config.AI_API_KEY:
        raise RuntimeError("AI_API_KEY не задан — ИИ-сервис не сконфигурирован")
    return ChatOpenAI(
        model=model,
        base_url=config.AI_BASE_URL,
        api_key=config.AI_API_KEY,
        temperature=temperature,
        timeout=300,
        max_retries=2,
    )


def _extract_json(text: str) -> dict:
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    payload = m.group(1) if m else text
    start = payload.find("{")
    end = payload.rfind("}")
    if start < 0 or end <= start:
        raise ValueError(f"Ответ модели не содержит JSON: {text[:200]}")
    return json.loads(payload[start : end + 1])


class CourseworkAgent:
    def __init__(self, quality: str = "balanced") -> None:
        model = config.QUALITY_MODELS.get(quality, config.AI_MODEL_BALANCED)
        self.llm = _build_llm(temperature=0.4, model=model)
        self.checker = _build_llm(temperature=0.0, model=model)
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
            draft = await self._write_section(
                opts, source_context, outline, section, running_summary
            )
            await progress(
                f"Раздел {idx + 1}/{total}: самопроверка", base + 0.45 / total
            )
            final = await self._self_check_section(opts, section, draft)
            body_parts.append(final.strip())
            running_summary += f"\n— {section.title}: {self._summarize(final)}"

        document = "\n\n".join(body_parts)
        await progress("Финальная проверка документа", 0.82)
        issues = self._lint(document, opts)
        if issues:
            await progress("Исправление замечаний", 0.88)
            document = await self._final_fix(document, issues)

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
        fixed = self._strip_fences(resp.content)
        if not fixed.strip():
            raise ValueError("Модель вернула пустой документ — правка не применена")
        return fixed.strip() + "\n"

    # ---------- шаги ----------

    async def _make_outline(self, opts: GenerationOptions, context: str) -> Outline:
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
        resp = await self.llm.ainvoke(
            [SystemMessage(content=system), HumanMessage(content=user)]
        )
        outline = Outline.model_validate(_extract_json(resp.content))
        if not outline.sections:
            raise ValueError("Модель вернула пустой план")
        # Гарантируем обязательные структурные элементы.
        titles_lower = [s.title.strip().lower() for s in outline.sections]
        if "введение" not in titles_lower:
            outline.sections.insert(0, OutlineSection(title="Введение"))
        if "заключение" not in titles_lower:
            outline.sections.append(OutlineSection(title="Заключение"))
        if opts.include_bibliography and not any(
            t.startswith("список") for t in titles_lower
        ):
            outline.sections.append(
                OutlineSection(title="Список использованных источников")
            )
        # Приложение с кодом — структурный элемент в самом конце (после списка).
        if opts.include_code_appendix and not any(
            t.startswith("приложени") for t in titles_lower
        ):
            outline.sections.append(
                OutlineSection(title="Приложение А. Листинг кода")
            )
        return outline

    async def _write_section(
        self,
        opts: GenerationOptions,
        context: str,
        outline: Outline,
        section: OutlineSection,
        running_summary: str,
    ) -> str:
        plan = "\n".join(
            f"- {s.title}" + (f" ({', '.join(s.subsections)})" if s.subsections else "")
            for s in outline.sections
        )
        is_bib = section.title.strip().lower().startswith("список")
        is_appendix = section.title.strip().lower().startswith("приложени")
        words_per_section = max(
            350, opts.target_pages * 230 // max(len(outline.sections) - 1, 1)
        )
        features = []
        if opts.include_tables:
            features.append("при уместности добавь 1 таблицу с подписью «Таблица: …»")
        if opts.include_diagrams:
            features.append(
                "при уместности добавь 1 mermaid-схему с подписью «Рисунок: …»"
            )
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

        if is_bib:
            task = (
                "Составь список из 8–15 реалистичных источников по теме "
                "(учебники, статьи, стандарты, электронные ресурсы) с оформлением по ГОСТ. "
                "Электронные ресурсы — с URL и датой обращения."
            )
        elif is_appendix:
            task = (
                "Приведи 1–3 листинга кода, относящегося к теме работы (ключевые "
                "алгоритмы/функции/классы). Перед каждым листингом — короткая строка-"
                "пояснение что это. Код помещай в блоки ```python (или ```sql/```java — "
                "по уместному языку). Без длинного текста, только пояснения и листинги."
            )
        else:
            task = (
                f"Напиши ПОЛНЫЙ текст этого раздела (~{words_per_section} слов). "
                + (" ".join(features) if features and not section.title.lower() in ("введение", "заключение") else "")
            )

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

Начни ровно со строки `# {section.title}`. Верни только markdown, без пояснений и без обрамляющих ```."""
        resp = await self.llm.ainvoke(
            [SystemMessage(content=system), HumanMessage(content=user)]
        )
        return self._strip_fences(resp.content)

    async def _self_check_section(
        self, opts: GenerationOptions, section: OutlineSection, draft: str
    ) -> str:
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
        fixed = self._strip_fences(resp.content)
        # Защита от деградации: если проверяющий вернул подозрительно мало — оставляем черновик.
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
        fixed = self._strip_fences(resp.content)
        return fixed if len(fixed) > len(document) * 0.6 else document

    # ---------- утилиты ----------

    @staticmethod
    def _strip_fences(text: str) -> str:
        t = text.strip()
        m = re.match(r"^```(?:markdown|md)?\s*\n(.*)\n```$", t, re.DOTALL)
        return m.group(1).strip() if m else t

    @staticmethod
    def _summarize(text: str) -> str:
        plain = re.sub(r"[#*`$|]", "", text)
        return " ".join(plain.split()[:60]) + "…"

    @staticmethod
    def _lint(document: str, opts: GenerationOptions) -> list[str]:
        issues: list[str] = []
        if not re.search(r"^# Введение\s*$", document, re.MULTILINE | re.IGNORECASE):
            issues.append("Отсутствует раздел «# Введение»")
        if not re.search(r"^# Заключение\s*$", document, re.MULTILINE | re.IGNORECASE):
            issues.append("Отсутствует раздел «# Заключение»")
        if opts.include_bibliography and not re.search(
            r"^# Список использованных источников\s*$", document, re.MULTILINE | re.IGNORECASE
        ):
            issues.append("Отсутствует раздел «# Список использованных источников»")
        lines = document.split("\n")
        for i, line in enumerate(lines):
            if line.strip().startswith("|") and i > 0:
                prev = next((l for l in reversed(lines[:i]) if l.strip()), "")
                if not (prev.strip().startswith("|") or re.match(r"^Таблица:", prev.strip(), re.IGNORECASE)):
                    issues.append(
                        "Перед таблицей нет подписи «Таблица: …» (строка "
                        f"{i + 1})"
                    )
                    break
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
        if not (opts.include_images or opts.include_web_images) and (has_url_img or has_mpl):
            issues.append("Изображения отключены настройками — убери `![…](…)` и блоки matplotlib")
        if re.search(r"^#{4,}\s", document, re.MULTILINE):
            issues.append("Использованы заголовки 4-го уровня и глубже — замени на ###")
        if re.search(r"^#\s+\d", document, re.MULTILINE):
            issues.append("Заголовки разделов содержат номера — убери их")
        return issues
