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

    runs: list[InlineRun] = []
    pos = 0
    for m in _PLACEHOLDER.finditer(t):
        if m.start() > pos:
            runs.append(InlineRun(text=t[pos:m.start()]))
        runs.append(stash[int(m.group(1))])
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


Block = (
    Heading | Paragraph | ListBlock | CodeBlock | MermaidBlock
    | MathBlock | Figure | Table | Quote | HRule
)

_HEADING = re.compile(r"^(#{1,3})\s+(.*)$")
_IMAGE = re.compile(r"^!\[([^\]]*)\]\(([^)]*)\)$")
_FIG_CAPTION = re.compile(r"^Рисунок:\s*(.*)$", re.IGNORECASE)
_TAB_CAPTION = re.compile(r"^Таблица:\s*(.*)$", re.IGNORECASE)
_TABLE_SEP = re.compile(r"^\|[\s:\-|]+\|?$")
_UL_ITEM = re.compile(r"^[-*]\s+")
_OL_ITEM = re.compile(r"^\d+[.)]\s+")
_HRULE = re.compile(r"^(---+|\*\*\*+)$")
_PARA_BREAK = re.compile(
    r"^(#{1,3}\s|```|\$\$|\||[-*]\s|\d+[.)]\s|>|!\[|---)"
)
_CAPTION_BREAK = re.compile(r"^(Рисунок|Таблица):", re.IGNORECASE)


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
            i += 1
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
            blocks.append(Heading(level=len(m.group(1)), text=m.group(2)))
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
            blocks.append(HRule())
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
        blocks.append(Paragraph(text=" ".join(buf)))

    return blocks


STRUCTURAL_RE = re.compile(
    r"^(введение|заключение|список|содержание|реферат|определения|обозначения|сокращения|приложени)",
    re.IGNORECASE,
)


def is_structural(text: str) -> bool:
    """Структурные элементы по ГОСТ 7.32-2017, п. 6.2.1 (не нумеруются)."""
    return bool(STRUCTURAL_RE.match(text.strip()))
