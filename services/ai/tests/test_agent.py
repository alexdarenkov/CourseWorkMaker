"""Тесты чистой логики агента: план, заголовки, бюджет слов, линт.

LLM не используется — проверяются функции уровня модуля.
"""

import pytest

from app.agent import (
    GenerationOptions,
    Outline,
    OutlineSection,
    ensure_single_heading,
    extract_json,
    lint_document,
    lint_user_document,
    normalize_outline,
    replace_section,
    section_word_target,
    split_sections,
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


# ---------- split_sections / replace_section ----------

SECTIONED = """# Введение

Вводный текст.

# Анализ

Текст анализа.

```python
# это комментарий в коде, а не заголовок
```

# Заключение

Выводы.
"""


def test_split_sections_titles_and_bodies():
    parts = split_sections(SECTIONED)
    assert [t for t, _ in parts] == ["Введение", "Анализ", "Заключение"]
    analysis = parts[1][1]
    assert "Текст анализа." in analysis
    assert "# это комментарий" in analysis  # заголовок в коде не режет раздел


def test_split_sections_preamble_without_heading():
    parts = split_sections("Преамбула без заголовка.\n\n# Раздел\n\nТекст.")
    assert parts[0][0] is None
    assert parts[1][0] == "Раздел"


def test_replace_section_swaps_only_target():
    out = replace_section(SECTIONED, "анализ", "# Анализ\n\nНовый текст раздела.")
    assert "Новый текст раздела." in out
    assert "Текст анализа." not in out
    assert "Вводный текст." in out and "Выводы." in out


def test_replace_section_missing_raises():
    with pytest.raises(ValueError):
        replace_section(SECTIONED, "Несуществующий раздел", "# Х\n\nТекст.")


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
    assert any("12 колонок" in i for i in lint_user_document(doc))


def test_lint_normal_table_not_flagged():
    # 6 колонок — в пределах читаемого, замечаний о ширине нет.
    doc = GOOD_DOC + "\n" + _wide_table_md(6)
    assert not any("колонок" in i for i in lint_document(doc, opts()))


def test_lint_wide_table_inside_code_ignored():
    fake = "```\n| " + " | ".join("К" for _ in range(20)) + " |\n```\n"
    assert not any("колонок" in i for i in lint_user_document(GOOD_DOC + "\n" + fake))


def test_lint_huge_mermaid_flagged():
    nodes = "\n".join(f"  A{i} --> A{i + 1}" for i in range(25))
    doc = GOOD_DOC + f"\nРисунок: Схема-гигант\n```mermaid\nflowchart TD\n{nodes}\n```\n"
    issues = lint_user_document(doc)
    assert any("нечитаемой" in i for i in issues)
    # Компактная схема из GOOD_DOC замечаний не вызывает.
    assert not any("нечитаемой" in i for i in lint_user_document(GOOD_DOC))


# ---------- lint_user_document (нормоконтроль в редакторе) ----------

def test_user_lint_clean_document():
    assert lint_user_document(GOOD_DOC) == []


def test_user_lint_allows_any_images_and_formulas():
    # Пользовательский нормоконтроль не знает настроек генерации — картинки,
    # локальные ассеты и формулы не считаются нарушением.
    doc = GOOD_DOC + "\n![Фото](asset:img-abc)\n\n$$E = mc^2$$\n"
    assert lint_user_document(doc) == []


def test_user_lint_flags_matplotlib_block():
    doc = GOOD_DOC + "\n```matplotlib\nplt.plot([1])\n```\n"
    assert any("matplotlib" in i for i in lint_user_document(doc))


def test_user_lint_missing_sections_and_captions():
    issues = lint_user_document("# Анализ\n\n| А |\n|---|\n| 1 |\n")
    joined = " ".join(issues)
    assert "Введение" in joined and "Таблица" in joined


# ---------- summarize_section ----------

def test_summarize_section_includes_subsections():
    text = "# Раздел\n\n## Первый подраздел\n\nТекст раздела о чём-то важном.\n\n## Второй\n\nЕщё текст."
    s = summarize_section(text)
    assert "Первый подраздел" in s and "Второй" in s
