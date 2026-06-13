import io

from docx import Document

from app.gost import build_docx
from app.md_parser import (
    CodeBlock,
    Figure,
    Heading,
    ListBlock,
    MathBlock,
    MermaidBlock,
    Paragraph,
    Table,
    parse_inline,
    parse_markdown,
)
from app.models import GostSettings

SAMPLE = """# Введение

Текст **жирный** и *курсив* с формулой $x^2$.

# Анализ предметной области

## Обзор решений

Таблица: Сравнение
| А | Б |
|---|---|
| 1 | 2 |

Рисунок: Схема
```mermaid
flowchart LR
  A --> B
```

$$E = mc^2$$

```python
print("hi")
```

- пункт один;
- пункт два.

# Список использованных источников

1. ГОСТ 7.32-2017.
2. Второй источник.
"""


def test_parse_blocks():
    blocks = parse_markdown(SAMPLE)
    types = [type(b) for b in blocks]
    assert types == [
        Heading, Paragraph, Heading, Heading, Table, MermaidBlock,
        MathBlock, CodeBlock, ListBlock, Heading, ListBlock,
    ]
    table = blocks[4]
    assert table.caption == "Сравнение"
    assert table.rows == [["А", "Б"], ["1", "2"]]
    mermaid = blocks[5]
    assert mermaid.caption == "Схема"


def test_parse_inline():
    runs = parse_inline("a **b** *c* `d` $e$ [f](http://x)")
    flags = [(r.text, r.bold, r.italic, r.code, r.underline, r.math) for r in runs]
    assert ("b", True, False, False, False, None) in flags
    assert ("c", False, True, False, False, None) in flags
    assert ("d", False, False, True, False, None) in flags
    assert ("f", False, False, False, True, None) in flags
    assert any(r.math == "e" for r in runs)


def test_build_docx_smoke():
    settings = GostSettings(
        university="Тестовый университет",
        department="Кафедра тестов",
        discipline="Тестирование",
        topic="Тема работы",
        group="Т-01",
        student="Иванов Иван",
        supervisor="Петров П. П.",
        city="Москва",
        year="2026",
    )
    data = build_docx(SAMPLE, settings, {})
    doc = Document(io.BytesIO(data))
    texts = [p.text for p in doc.paragraphs]
    joined = "\n".join(texts)
    assert "КУРСОВАЯ РАБОТА" in joined
    assert "СОДЕРЖАНИЕ" in joined
    assert "ВВЕДЕНИЕ" in joined
    assert "1\u00a0Анализ предметной области" in joined
    assert "1.1 Обзор решений" in joined
    assert "Таблица 1 — Сравнение" in joined
    assert "Рисунок 1 — Схема" in joined  # mermaid без ассета -> плейсхолдер + подпись
    assert "1. ГОСТ 7.32-2017." in joined  # библиография «N.»
    assert "– пункт один;" in joined
    assert len(doc.tables) == 1

    sec = doc.sections[0]
    assert round(sec.left_margin.mm) == 30
    assert round(sec.right_margin.mm) == 15
    assert round(sec.top_margin.mm) == 20
    assert round(sec.bottom_margin.mm) == 20


def test_build_docx_no_extras():
    settings = GostSettings(
        title_page=False, toc=False, page_numbers=False,
        bibliography=False, auto_number=False,
    )
    data = build_docx("# Введение\n\nПросто текст.", settings, {})
    doc = Document(io.BytesIO(data))
    joined = "\n".join(p.text for p in doc.paragraphs)
    assert "КУРСОВАЯ РАБОТА" not in joined
    assert "СОДЕРЖАНИЕ" not in joined
    assert "ВВЕДЕНИЕ" in joined
