"""Тесты чистой логики агента: план, заголовки, бюджет слов, линт.

LLM не используется — проверяются функции уровня модуля.
"""

import pytest

from app.ai.agent import (
    GenerationOptions,
    Outline,
    OutlineSection,
    ensure_single_heading,
    extract_json,
    lint_document,
    normalize_outline,
    section_word_target,
    strip_fences,
    summarize_section,
)


def opts(**kw) -> GenerationOptions:
    return GenerationOptions(topic="Тестовая тема курсовой", **kw)


# ---------- extract_json / strip_fences ----------

def test_extract_json_plain():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_fenced_with_prose():
    text = 'Вот план:\n```json\n{"sections": []}\n```\nГотово.'
    assert extract_json(text) == {"sections": []}


def test_extract_json_garbage_raises():
    with pytest.raises(ValueError):
        extract_json("никакого джсона здесь нет")


def test_strip_fences():
    assert strip_fences("```markdown\n# Раздел\n```") == "# Раздел"
    assert strip_fences("# Раздел") == "# Раздел"


# ---------- normalize_outline ----------

def test_outline_adds_missing_structural_sections():
    outline = normalize_outline(
        Outline(sections=[OutlineSection(title="Анализ данных")]), opts()
    )
    titles = [s.title for s in outline.sections]
    assert titles == [
        "Введение",
        "Анализ данных",
        "Заключение",
        "Список использованных источников",
    ]


def test_outline_reorders_and_deduplicates():
    outline = normalize_outline(
        Outline(
            sections=[
                OutlineSection(title="Заключение"),
                OutlineSection(title="Обзор литературы"),
                OutlineSection(title="Введение", subsections=["Актуальность"]),
                OutlineSection(title="Список использованных источников"),
            ]
        ),
        opts(),
    )
    titles = [s.title for s in outline.sections]
    assert titles == [
        "Введение",
        "Обзор литературы",
        "Заключение",
        "Список использованных источников",
    ]
    # У структурных элементов подразделов быть не должно.
    assert outline.sections[0].subsections == []


def test_outline_respects_disabled_bibliography_and_appendix():
    outline = normalize_outline(
        Outline(sections=[OutlineSection(title="Основная часть")]),
        opts(include_bibliography=False),
    )
    assert [s.title for s in outline.sections] == [
        "Введение", "Основная часть", "Заключение",
    ]


def test_outline_appendix_goes_last():
    outline = normalize_outline(
        Outline(sections=[OutlineSection(title="Основная часть")]),
        opts(include_code_appendix=True),
    )
    assert outline.sections[-1].title == "Приложение А. Листинг кода"
    assert outline.sections[-2].title == "Список использованных источников"


def test_outline_truncates_excessive_sections():
    many = [OutlineSection(title=f"Раздел {i}") for i in range(20)]
    outline = normalize_outline(Outline(sections=many), opts())
    body = [s for s in outline.sections if s.title.startswith("Раздел")]
    assert len(body) == 8


def test_outline_keeps_descriptions_including_structural():
    # AI-12: desc содержательных И структурных разделов из пользовательского
    # плана сохраняется (пользователь мог уточнить их на /create).
    outline = normalize_outline(
        Outline(
            sections=[
                OutlineSection(title="Введение", desc="Цель и задачи по методичке"),
                OutlineSection(title="Обзор методов", desc="Сравнение трёх подходов"),
            ]
        ),
        opts(),
    )
    by_title = {s.title: s.desc for s in outline.sections}
    assert by_title["Введение"] == "Цель и задачи по методичке"
    assert by_title["Обзор методов"] == "Сравнение трёх подходов"


def test_generation_options_accept_user_plan():
    # AI-12: /generate принимает утверждённый план полем plan.
    o = opts(plan=[{"title": "Анализ", "desc": "Разбор данных", "subsections": ["Метрики"]}])
    assert o.plan is not None and o.plan[0].title == "Анализ"
    normalized = normalize_outline(Outline(sections=o.plan), o)
    assert [s.title for s in normalized.sections][:2] == ["Введение", "Анализ"]


def test_user_plan_without_content_sections_rejected():
    # generate() с планом из одних структурных элементов падает ДО вызова LLM.
    o = opts(plan=[{"title": "Введение"}, {"title": "Заключение"}])
    normalized = normalize_outline(Outline(sections=o.plan), o)
    from app.ai.agent import is_structural

    assert not any(not is_structural(s.title) for s in normalized.sections)


# ---------- ensure_single_heading ----------

def test_heading_prepended_when_missing():
    out = ensure_single_heading("Просто текст без заголовка.", "Анализ")
    assert out.startswith("# Анализ\n")


def test_extra_h1_demoted_to_h2():
    out = ensure_single_heading("# Анализ\n\nТекст.\n\n# Выводы по разделу\n\nЕщё.", "Анализ")
    assert out.count("\n# ") == 0  # единственный h1 — в первой строке
    assert "## Выводы по разделу" in out


def test_structural_heading_forced_to_exact_title():
    out = ensure_single_heading("# ВВЕДЕНИЕ В ТЕМУ\n\nТекст.", "Введение")
    assert out.splitlines()[0] == "# Введение"


def test_heading_inside_code_fence_untouched():
    src = "# Раздел\n\n```python\n# комментарий, а не заголовок\n```"
    assert ensure_single_heading(src, "Раздел") == src


# ---------- section_word_target ----------

def test_word_targets_smaller_for_intro_and_conclusion():
    o = normalize_outline(
        Outline(sections=[OutlineSection(title="А"), OutlineSection(title="Б")]),
        opts(target_pages=20),
    )
    intro, a, b, concl = o.sections[0], o.sections[1], o.sections[2], o.sections[3]
    w_intro = section_word_target(opts(target_pages=20), o, intro)
    w_body = section_word_target(opts(target_pages=20), o, a)
    w_concl = section_word_target(opts(target_pages=20), o, concl)
    assert w_intro < w_body and w_concl < w_body
    # Основной объём делится между содержательными разделами.
    total = 20 * 230
    assert w_body == (total - w_intro - w_concl) // 2


# ---------- lint_document ----------

GOOD_DOC = """# Введение

Актуальность темы подтверждена [1].

# Анализ

Таблица: Сравнение
| А | Б |
|---|---|
| 1 | 2 |

Рисунок: Схема
```mermaid
flowchart LR
  A --> B
```

# Заключение

Выводы сделаны [2].

# Список использованных источников

1. Первый источник.
2. Второй источник.
"""


def test_lint_clean_document():
    assert lint_document(GOOD_DOC, opts()) == []


def test_lint_missing_structural_sections():
    issues = lint_document("# Анализ\n\nТекст.", opts())
    joined = " ".join(issues)
    assert "Введение" in joined and "Заключение" in joined and "источников" in joined


def test_lint_table_without_caption():
    doc = GOOD_DOC.replace("Таблица: Сравнение\n", "")
    assert any("Таблица" in i for i in lint_document(doc, opts()))


def test_lint_mermaid_without_caption():
    doc = GOOD_DOC.replace("Рисунок: Схема\n", "")
    assert any("mermaid" in i for i in lint_document(doc, opts()))


def test_lint_citation_out_of_range():
    doc = GOOD_DOC.replace("[1]", "[9]")
    assert any("[9]" in i for i in lint_document(doc, opts()))


def test_lint_no_citations_at_all():
    doc = GOOD_DOC.replace("[1]", "").replace("[2]", "")
    assert any("ссылок на источники" in i for i in lint_document(doc, opts()))


def test_lint_markdown_link_is_not_citation():
    # `[1](http://…)` — это ссылка markdown, а не библиографическая [1].
    doc = GOOD_DOC.replace("[1]", "[1](http://example.com) [1]")
    assert lint_document(doc, opts()) == []


def test_lint_web_images_forbidden_by_default():
    doc = GOOD_DOC + "\n![Фото](https://example.com/a.png)\n"
    assert any("URL" in i for i in lint_document(doc, opts()))


def test_lint_web_images_allowed_when_enabled():
    doc = GOOD_DOC + "\n![Фото](https://example.com/a.png)\n"
    assert lint_document(doc, opts(include_web_images=True)) == []


def test_lint_matplotlib_forbidden_by_default():
    doc = GOOD_DOC + "\n```matplotlib\nplt.plot([1, 2])\n```\n"
    assert any("matplotlib" in i for i in lint_document(doc, opts()))


def test_lint_local_image_path():
    doc = GOOD_DOC + "\n![Схема](images/local.png)\n"
    assert any("локальный" in i for i in lint_document(doc, opts()))


def test_lint_formulas_forbidden_by_default():
    doc = GOOD_DOC + "\n$$E = mc^2$$\n"
    assert any("$$" in i for i in lint_document(doc, opts()))
    assert lint_document(doc, opts(include_formulas=True)) == []


def test_lint_deep_and_numbered_headings():
    doc = GOOD_DOC + "\n#### Глубокий заголовок\n\n## 4.3 Ручной номер\n"
    joined = " ".join(lint_document(doc, opts()))
    assert "4-го уровня" in joined and "ручные номера" in joined.lower()


# ---------- _lint_oversized (габариты таблиц и схем) ----------

def _wide_table_md(cols: int) -> str:
    header = "| " + " | ".join(f"К{i}" for i in range(cols)) + " |"
    sep = "|" + "---|" * cols
    row = "| " + " | ".join(str(i) for i in range(cols)) + " |"
    return f"Таблица: Ш\n{header}\n{sep}\n{row}\n"


def test_lint_wide_table_flagged():
    doc = GOOD_DOC + "\n" + _wide_table_md(12)
    issues = lint_document(doc, opts())
    assert any("12 колонок" in i for i in issues)


def test_lint_normal_table_not_flagged():
    # 6 колонок — в пределах читаемого, замечаний о ширине нет.
    doc = GOOD_DOC + "\n" + _wide_table_md(6)
    assert not any("колонок" in i for i in lint_document(doc, opts()))


def test_lint_wide_table_inside_code_ignored():
    fake = "```\n| " + " | ".join("К" for _ in range(20)) + " |\n```\n"
    assert not any("колонок" in i for i in lint_document(GOOD_DOC + "\n" + fake, opts()))


def test_lint_huge_mermaid_flagged():
    nodes = "\n".join(f"  A{i} --> A{i + 1}" for i in range(25))
    doc = GOOD_DOC + f"\nРисунок: Схема-гигант\n```mermaid\nflowchart TD\n{nodes}\n```\n"
    issues = lint_document(doc, opts())
    assert any("нечитаемой" in i for i in issues)
    # Компактная схема из GOOD_DOC замечаний не вызывает.
    assert not any("нечитаемой" in i for i in lint_document(GOOD_DOC, opts()))


# ---------- summarize_section ----------

def test_summarize_section_includes_subsections():
    text = "# Раздел\n\n## Первый подраздел\n\nТекст раздела о чём-то важном.\n\n## Второй\n\nЕщё текст."
    s = summarize_section(text)
    assert "Первый подраздел" in s and "Второй" in s
