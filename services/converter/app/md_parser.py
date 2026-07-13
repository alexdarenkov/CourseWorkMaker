"""Парсер Markdown в блочную модель, идентичную превью на фронтенде.

Поддерживаемое подмножество согласовано с редактором: заголовки #..###,
абзацы, списки, таблицы, код, mermaid, формулы $$...$$, картинки,
цитаты, hr и строки-подписи «Рисунок: …» / «Таблица: …».
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


# ---------- inline ----------

@dataclass
class InlineRun:
    text: str = ""
    bold: bool = False
    italic: bool = False
    code: bool = False
    underline: bool = False
    math: str | None = None  # inline LaTeX


_INLINE_CODE = re.compile(r"`([^`]+)`")
_INLINE_MATH = re.compile(r"\$([^$\n]+)\$")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_ITALIC = re.compile(r"\*([^*]+)\*")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_PLACEHOLDER = re.compile("\x00(\\d+)\x00")


def parse_inline(text: str) -> list[InlineRun]:
    stash: list[InlineRun] = []

    def put(run: InlineRun) -> str:
        stash.append(run)
        return f"\x00{len(stash) - 1}\x00"

    t = _INLINE_CODE.sub(lambda m: put(InlineRun(text=m.group(1), code=True)), text)
    t = _INLINE_MATH.sub(lambda m: put(InlineRun(math=m.group(1))), t)
    t = _BOLD.sub(lambda m: put(InlineRun(text=m.group(1), bold=True)), t)
    t = _ITALIC.sub(lambda m: put(InlineRun(text=m.group(1), italic=True)), t)
    t = _LINK.sub(lambda m: put(InlineRun(text=m.group(1), underline=True)), t)

    # При вложенном форматировании (например, `код` или $формула$ внутри
    # **жирного**) во тексте захваченного рана остаётся маркер-плейсхолдер \x00.
    # Модель ранов плоская, поэтому раскрываем такие плейсхолдеры в обычный
    # текст вложенного элемента — иначе \x00 попадёт в DOCX и lxml упадёт
    # («no NULL bytes or control characters»).
    def expand(s: str) -> str:
        def repl(m: re.Match) -> str:
            r = stash[int(m.group(1))]
            return expand(r.text if r.math is None else r.math)
        return _PLACEHOLDER.sub(repl, s)

    runs: list[InlineRun] = []
    pos = 0
    for m in _PLACEHOLDER.finditer(t):
        if m.start() > pos:
            runs.append(InlineRun(text=t[pos:m.start()]))
        r = stash[int(m.group(1))]
        if r.text:
            r.text = expand(r.text)
        runs.append(r)
        pos = m.end()
    if pos < len(t):
        runs.append(InlineRun(text=t[pos:]))
    return [r for r in runs if r.text or r.math]


def plain_text(runs: list[InlineRun]) -> str:
    return "".join(r.text if r.math is None else r.math for r in runs)


# ---------- blocks ----------

@dataclass
class Heading:
    level: int
    text: str


@dataclass
class Paragraph:
    text: str


@dataclass
class ListBlock:
    ordered: bool
    items: list[str]


@dataclass
class CodeBlock:
    lang: str
    code: str


@dataclass
class MermaidBlock:
    code: str
    caption: str | None = None


@dataclass
class MathBlock:
    latex: str


@dataclass
class Figure:
    alt: str
    src: str
    caption: str | None = None


@dataclass
class Table:
    rows: list[list[str]] = field(default_factory=list)
    caption: str | None = None


@dataclass
class Quote:
    text: str


@dataclass
class HRule:
    pass


@dataclass
class PageBreak:
    pass


@dataclass
class Blank:
    pass


Block = (
    Heading | Paragraph | ListBlock | CodeBlock | MermaidBlock
    | MathBlock | Figure | Table | Quote | HRule | PageBreak | Blank
)

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
# Ручной номер в начале заголовка («4.3 », «1.2.1 », «1. ») — срезаем, чтобы не
# дублировать автоматическую нумерацию.
_HEAD_NUM = re.compile(r"^\s*\d+(?:\.\d+)*[.)]?\s+")
# Точка в конце заголовка не ставится (ГОСТ 7.32) — срезаем хвостовую.
_HEAD_TRAIL_DOT = re.compile(r"\s*\.$")
_IMAGE = re.compile(r"^!\[([^\]]*)\]\(([^)]*)\)$")
_FIG_CAPTION = re.compile(r"^Рисунок:\s*(.*)$", re.IGNORECASE)
_TAB_CAPTION = re.compile(r"^Таблица:\s*(.*)$", re.IGNORECASE)
_TABLE_SEP = re.compile(r"^\|[\s:\-|]+\|?$")
_UL_ITEM = re.compile(r"^[-*]\s+")
_OL_ITEM = re.compile(r"^\d+[.)]\s+")
_HRULE = re.compile(r"^(---+|\*\*\*+)$")
_PARA_BREAK = re.compile(
    r"^(#{1,6}\s|```|\$\$|\||[-*]\s|\d+[.)]\s|>|!\[|---)"
)
_CAPTION_BREAK = re.compile(r"^(Рисунок|Таблица):", re.IGNORECASE)


def _drop_blank_after_heading(blocks: list[Block]) -> list[Block]:
    """Заголовок «съедает» идущие сразу за ним пустые строки: между заголовком и
    текстом не должно быть лишнего пустого абзаца — вертикальный интервал задаёт
    стиль заголовка (space_after 21/14/12 пт), а не ручные переносы. Проверяем
    последний УЖЕ добавленный блок, поэтому подряд идущие Blank'и после заголовка
    схлопываются все. Зеркалит dropBlankAfterHeading в
    frontend/src/lib/markdown.ts."""
    out: list[Block] = []
    for b in blocks:
        if isinstance(b, Blank) and out and isinstance(out[-1], Heading):
            continue
        out.append(b)
    return out


def parse_markdown(md: str) -> list[Block]:
    lines = md.split("\n")
    blocks: list[Block] = []
    pending_fig: str | None = None
    pending_tab: str | None = None
    i = 0
    n = len(lines)

    while i < n:
        t = lines[i].strip()
        if not t:
            # Пустые строки: каждая ЛИШНЯЯ (сверх одной, разделяющей абзацы)
            # даёт видимую пустую строку в выводе.
            blanks = 0
            while i < n and not lines[i].strip():
                blanks += 1
                i += 1
            blocks.extend(Blank() for _ in range(blanks - 1))
            continue

        m = re.match(r"^```(\S*)", t)
        if m:
            lang = (m.group(1) or "").lower()
            buf: list[str] = []
            i += 1
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            if lang == "mermaid":
                blocks.append(MermaidBlock(code="\n".join(buf), caption=pending_fig))
                pending_fig = None
            else:
                blocks.append(CodeBlock(lang=lang, code="\n".join(buf)))
            continue

        if t.startswith("$$"):
            content = t[2:]
            if content.endswith("$$") and len(content) >= 2 and len(t) > 4:
                content = content[:-2]
                i += 1
            else:
                buf = [content] if content else []
                i += 1
                while i < n and "$$" not in lines[i]:
                    buf.append(lines[i])
                    i += 1
                if i < n:
                    last = lines[i].strip()
                    if last != "$$":
                        buf.append(re.sub(r"\$\$\s*$", "", last))
                    i += 1
                content = "\n".join(buf)
            blocks.append(MathBlock(latex=content.strip()))
            continue

        m = _HEADING.match(t)
        if m:
            level = min(3, len(m.group(1)))  # глубже 3-го уровня ГОСТ не нумерует
            text = _HEAD_NUM.sub("", m.group(2))  # срезаем ручной номер
            text = _HEAD_TRAIL_DOT.sub("", text)  # и точку в конце заголовка
            blocks.append(Heading(level=level, text=text))
            i += 1
            continue

        m = _IMAGE.match(t)
        if m:
            blocks.append(Figure(alt=m.group(1), src=m.group(2), caption=pending_fig))
            pending_fig = None
            i += 1
            continue

        m = _FIG_CAPTION.match(t)
        if m:
            pending_fig = m.group(1)
            i += 1
            continue

        m = _TAB_CAPTION.match(t)
        if m:
            pending_tab = m.group(1)
            i += 1
            continue

        if t.startswith("|"):
            raw: list[str] = []
            while i < n and lines[i].strip().startswith("|"):
                raw.append(lines[i].strip())
                i += 1
            rows = [
                [c.strip() for c in r.strip("|").split("|")]
                for r in raw
                if not _TABLE_SEP.match(r)
            ]
            blocks.append(Table(rows=rows, caption=pending_tab))
            pending_tab = None
            continue

        if _UL_ITEM.match(t):
            items: list[str] = []
            while i < n and _UL_ITEM.match(lines[i].strip()):
                items.append(_UL_ITEM.sub("", lines[i].strip(), count=1))
                i += 1
            blocks.append(ListBlock(ordered=False, items=items))
            continue

        if _OL_ITEM.match(t):
            items = []
            while i < n and _OL_ITEM.match(lines[i].strip()):
                items.append(_OL_ITEM.sub("", lines[i].strip(), count=1))
                i += 1
            blocks.append(ListBlock(ordered=True, items=items))
            continue

        if t.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(re.sub(r"^>\s?", "", lines[i].strip()))
                i += 1
            blocks.append(Quote(text=" ".join(buf)))
            continue

        if _HRULE.match(t):
            # «---» / «***» — разрыв страницы.
            blocks.append(PageBreak())
            i += 1
            continue

        buf = [t]
        i += 1
        while i < n:
            nt = lines[i].strip()
            if not nt or _PARA_BREAK.match(nt) or _CAPTION_BREAK.match(nt):
                break
            buf.append(nt)
            i += 1
        blocks.append(Paragraph(text=_join_para(buf)))

    return _drop_blank_after_heading(blocks)


def _join_para(lines: list[str]) -> str:
    """Каждый перенос строки в редакторе = перенос строки в выводе (breaks:true).
    Пустая строка по-прежнему начинает новый абзац. Хвостовой «\\» срезаем."""
    return "\n".join(l[:-1].rstrip() if l.endswith("\\") else l for l in lines)


STRUCTURAL_RE = re.compile(
    r"^(введение|заключение|список|содержание|реферат|определения|обозначения|сокращения|приложени)",
    re.IGNORECASE,
)


def is_structural(text: str) -> bool:
    """Структурные элементы по ГОСТ 7.32-2017, п. 6.2.1 (не нумеруются)."""
    return bool(STRUCTURAL_RE.match(text.strip()))


_GDE_RE = re.compile(r"^где\s", re.IGNORECASE)
_DASH_RE = re.compile(r"[–—-]")


def split_gde(text: str) -> list[str] | None:
    """Пояснения к формуле «где A — …». Возвращает список строк (по одному
    пояснению на строку, если разделены «;»), либо одной строкой. None — если
    это не блок пояснений (начинается с «где » и содержит тире)."""
    t = text.strip()
    if not _GDE_RE.match(t) or not _DASH_RE.search(t):
        return None
    if ";" in t:
        parts = [p.strip() for p in t.split(";") if p.strip()]
        if len(parts) >= 2:
            return [p + ";" if i < len(parts) - 1 else p for i, p in enumerate(parts)]
    return [t]
