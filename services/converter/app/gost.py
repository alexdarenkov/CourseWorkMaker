"""Сборка .docx по ГОСТ 7.32-2017.

Ключевые требования стандарта (разд. 6):
- А4, поля: левое 30 мм, правое 15 мм, верхнее и нижнее 20 мм (6.1.1);
- Times New Roman, кегль 14 пт, полуторный интервал, абзацный отступ 1,25 см (6.1.1);
- структурные заголовки (ВВЕДЕНИЕ, ЗАКЛЮЧЕНИЕ и т. д.) — прописными, по центру,
  без точки, каждый с новой страницы (6.2.1); разделы нумеруются арабскими цифрами
  без точки, заголовок с абзацного отступа, полужирный (6.2.3, 6.4.1);
- нумерация страниц — по центру нижней части листа, титульный лист входит
  в нумерацию, но номер на нём не проставляется (6.3.1, 6.3.2);
- «Рисунок N — Название» по центру под иллюстрацией (6.5.7);
- «Таблица N — Название» слева над таблицей без абзацного отступа (6.6.3);
- формулы — отдельной строкой по центру, номер в круглых скобках в крайнем
  правом положении, по свободной строке до и после (6.8.1, 6.8.3);
- содержание: записи влево, номера страниц справа через отточие (6.13);
- список использованных источников: нумерация арабскими цифрами с точкой,
  с абзацного отступа (6.16).
"""

from __future__ import annotations

import io
import logging
import re

from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.image.image import Image as DocxImage
from docx.oxml import parse_xml
from docx.oxml.ns import qn
from docx.shared import Cm, Mm, Pt, RGBColor

from . import md_parser as mdp
from .images import AssetResolver
from .models import GostSettings
from .omml import latex_to_omml_element

log = logging.getLogger(__name__)

FONT_MAIN = "Times New Roman"
FONT_CODE = "Courier New"
SIZE_MAIN = Pt(14)
SIZE_SMALL = Pt(12)
INDENT = Cm(1.25)
CONTENT_WIDTH_MM = 165  # 210 - 30 - 15
LINE_15 = 1.5
# Неразрывный пробел между номером и текстом заголовка — номер не отрывается
# от названия при переносе строки.
NBSP = "\u00a0"

_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def build_docx(markdown: str, settings: GostSettings, assets: dict[str, str]) -> bytes:
    builder = _GostBuilder(settings, AssetResolver(assets))
    builder.build(mdp.parse_markdown(markdown))
    buf = io.BytesIO()
    builder.doc.save(buf)
    return buf.getvalue()


class _GostBuilder:
    def __init__(self, settings: GostSettings, resolver: AssetResolver):
        self.s = settings
        self.resolver = resolver
        self.doc = Document()
        self.sec_n = 0
        self.sub_n = 0
        self.sub2_n = 0
        self.fig_n = 0
        self.tab_n = 0
        self.form_n = 0
        self.in_bib = False
        self._setup_page()
        self._setup_styles()

    # ---------- документ ----------

    def build(self, blocks: list[mdp.Block]) -> None:
        if self.s.title_page:
            self._title_page()
        if self.s.toc:
            self._toc()
        first_h1_seen = False
        for i, b in enumerate(blocks):
            if isinstance(b, mdp.Heading):
                self._heading(b, allow_break=first_h1_seen or self.s.title_page or self.s.toc)
                first_h1_seen = first_h1_seen or b.level == 1
            elif isinstance(b, mdp.Paragraph):
                self._paragraph(b.text)
            elif isinstance(b, mdp.ListBlock):
                self._list(b)
            elif isinstance(b, mdp.CodeBlock):
                self._code(b)
            elif isinstance(b, mdp.MermaidBlock):
                self._mermaid(b)
            elif isinstance(b, mdp.MathBlock):
                self._formula(b)
            elif isinstance(b, mdp.Figure):
                self._figure(b)
            elif isinstance(b, mdp.Table):
                self._table(b)
            elif isinstance(b, mdp.Quote):
                self._quote(b)
            elif isinstance(b, mdp.HRule):
                self._spacer()
        if self.s.page_numbers:
            self._page_numbers()

    # ---------- страница и стили ----------

    def _setup_page(self) -> None:
        sec = self.doc.sections[0]
        sec.page_width = Mm(210)
        sec.page_height = Mm(297)
        sec.left_margin = Mm(30)
        sec.right_margin = Mm(15)
        sec.top_margin = Mm(20)
        sec.bottom_margin = Mm(20)
        sec.footer_distance = Mm(10)

    def _setup_styles(self) -> None:
        normal = self.doc.styles["Normal"]
        normal.font.name = FONT_MAIN
        normal.font.size = SIZE_MAIN
        normal.font.color.rgb = RGBColor(0, 0, 0)
        pf = normal.paragraph_format
        pf.line_spacing = LINE_15
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)

        for name, size, before, after in (
            ("Heading 1", SIZE_MAIN, Pt(0), Pt(21)),
            ("Heading 2", SIZE_MAIN, Pt(14), Pt(14)),
            ("Heading 3", SIZE_MAIN, Pt(12), Pt(12)),
        ):
            st = self.doc.styles[name]
            st.font.name = FONT_MAIN
            st.font.size = size
            st.font.bold = True
            st.font.color.rgb = RGBColor(0, 0, 0)
            st.paragraph_format.line_spacing = LINE_15
            st.paragraph_format.space_before = before
            st.paragraph_format.space_after = after
            st.paragraph_format.keep_with_next = True

        # Стили оглавления (используются Word при обновлении поля TOC).
        for toc_name in ("TOC 1", "TOC 2", "TOC 3"):
            try:
                st = self.doc.styles[toc_name]
                st.font.name = FONT_MAIN
                st.font.size = SIZE_MAIN
                st.paragraph_format.line_spacing = LINE_15
            except KeyError:
                pass

    # ---------- низкоуровневые помощники ----------

    def _p(self, style: str | None = None):
        return self.doc.add_paragraph(style=style)

    def _add_runs(self, p, runs: list[mdp.InlineRun], base_size=SIZE_MAIN) -> None:
        for r in runs:
            if r.math is not None:
                omml = latex_to_omml_element(r.math)
                if omml is not None:
                    p._p.append(omml)
                    continue
                run = p.add_run(r.math)
                run.italic = True
                run.font.size = base_size
                continue
            run = p.add_run(r.text)
            run.bold = r.bold
            run.italic = r.italic
            run.underline = r.underline
            if r.code:
                run.font.name = FONT_CODE
                run.font.size = Pt(13)
            else:
                run.font.size = base_size

    def _add_text(self, p, text: str, base_size=SIZE_MAIN) -> None:
        self._add_runs(p, mdp.parse_inline(text), base_size)

    @staticmethod
    def _border_xml(sz: int = 8, space: int = 4) -> str:
        side = f'<w:{{s}} w:val="single" w:sz="{sz}" w:space="{space}" w:color="000000"/>'
        sides = "".join(side.format(s=s) for s in ("top", "left", "bottom", "right"))
        return f'<w:pBdr xmlns:w="{_W}">{sides}</w:pBdr>'

    def _add_paragraph_border(self, p) -> None:
        p.paragraph_format.element.get_or_add_pPr().append(parse_xml(self._border_xml()))

    @staticmethod
    def _field(p, instruction: str, placeholder: str = "") -> None:
        r = p.add_run()
        begin = parse_xml(f'<w:fldChar xmlns:w="{_W}" w:fldCharType="begin"/>')
        instr = parse_xml(
            f'<w:instrText xmlns:w="{_W}" xml:space="preserve">{instruction}</w:instrText>'
        )
        sep = parse_xml(f'<w:fldChar xmlns:w="{_W}" w:fldCharType="separate"/>')
        end = parse_xml(f'<w:fldChar xmlns:w="{_W}" w:fldCharType="end"/>')
        r._r.append(begin)
        r._r.append(instr)
        r._r.append(sep)
        if placeholder:
            t = parse_xml(
                f'<w:t xmlns:w="{_W}" xml:space="preserve">{placeholder}</w:t>'
            )
            r._r.append(t)
        r._r.append(end)

    # ---------- титульный лист ----------

    def _title_line(self, text: str, *, size=SIZE_SMALL, bold=False, upper=False,
                    align=WD_ALIGN_PARAGRAPH.CENTER, spacing=1.0):
        p = self._p()
        p.alignment = align
        p.paragraph_format.line_spacing = spacing
        run = p.add_run(text.upper() if upper else text)
        run.font.size = size
        run.bold = bold
        return p

    def _empty_lines(self, count: int, size=SIZE_MAIN) -> None:
        for _ in range(count):
            p = self._p()
            p.paragraph_format.line_spacing = 1.0
            p.add_run("").font.size = size

    def _title_page(self) -> None:
        s = self.s
        self._title_line("МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ")
        self._title_line(
            "Федеральное государственное бюджетное образовательное учреждение высшего образования"
        )
        if s.university:
            self._title_line(s.university, bold=True, size=Pt(13), upper=True)
        if s.department:
            self._empty_lines(1, SIZE_SMALL)
            self._title_line(s.department)
        self._empty_lines(7)
        self._title_line("КУРСОВАЯ РАБОТА", bold=True, size=Pt(18))
        self._empty_lines(1)
        if s.discipline:
            self._title_line(f"по дисциплине «{s.discipline}»", size=SIZE_MAIN)
        if s.topic:
            p = self._p()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.line_spacing = LINE_15
            p.add_run("на тему: «").font.size = SIZE_MAIN
            r = p.add_run(s.topic)
            r.font.size = SIZE_MAIN
            r.bold = True
            p.add_run("»").font.size = SIZE_MAIN
        self._empty_lines(8)

        block = [("Выполнил:", False)]
        if s.group:
            block.append((f"студент группы {s.group}", False))
        if s.student:
            block.append((s.student, False))
        block.append(("", False))
        block.append(("Руководитель:", False))
        if s.supervisor:
            block.append((s.supervisor, False))
        for text, bold in block:
            p = self._p()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.left_indent = Cm(8.6)
            p.paragraph_format.line_spacing = 1.15
            r = p.add_run(text)
            r.font.size = Pt(13)
            r.bold = bold

        self._empty_lines(8)
        self._title_line(s.city or "", size=Pt(13))
        self._title_line(s.year or "", size=Pt(13))

        self.doc.add_page_break()

    # ---------- содержание ----------

    def _toc(self) -> None:
        p = self._p(style="Heading 1")
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.first_line_indent = Cm(0)
        # Заголовок «СОДЕРЖАНИЕ» не должен попадать в само оглавление —
        # понижаем уровень структуры до «обычный текст».
        p.paragraph_format.element.get_or_add_pPr().append(
            parse_xml(f'<w:outlineLvl xmlns:w="{_W}" w:val="9"/>')
        )
        p.add_run("СОДЕРЖАНИЕ")

        toc_p = self._p()
        pf = toc_p.paragraph_format
        pf.tab_stops.add_tab_stop(
            Mm(CONTENT_WIDTH_MM), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS
        )
        self._field(
            toc_p,
            r'TOC \o "1-3" \h \z \u',
            "Оглавление обновится автоматически при открытии документа",
        )
        self._update_fields_on_open()
        self.doc.add_page_break()

    def _update_fields_on_open(self) -> None:
        settings = self.doc.settings.element
        if settings.find(qn("w:updateFields")) is None:
            settings.append(parse_xml(f'<w:updateFields xmlns:w="{_W}" w:val="true"/>'))

    # ---------- заголовки ----------

    def _heading(self, b: mdp.Heading, allow_break: bool) -> None:
        text = b.text.strip()
        if b.level == 1:
            structural = mdp.is_structural(text)
            self.in_bib = bool(re.match(r"^список", text, re.IGNORECASE))
            p = self._p(style="Heading 1")
            if allow_break:
                p.paragraph_format.page_break_before = True
            if structural:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.first_line_indent = Cm(0)
                self._add_text(p, text.upper())
            else:
                self.sec_n += 1
                self.sub_n = 0
                self.sub2_n = 0
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.paragraph_format.first_line_indent = INDENT
                p.add_run(f"{self.sec_n}{NBSP}")
                self._add_text(p, text)
        elif b.level == 2:
            self.sub_n += 1
            self.sub2_n = 0
            p = self._p(style="Heading 2")
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.first_line_indent = INDENT
            p.add_run(f"{self.sec_n}.{self.sub_n}{NBSP}")
            self._add_text(p, text)
        else:
            self.sub2_n += 1
            p = self._p(style="Heading 3")
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.first_line_indent = INDENT
            p.add_run(f"{self.sec_n}.{self.sub_n}.{self.sub2_n}{NBSP}")
            self._add_text(p, text)

    # ---------- основной текст ----------

    def _paragraph(self, text: str) -> None:
        p = self._p()
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.first_line_indent = INDENT
        self._add_text(p, text)

    def _list(self, b: mdp.ListBlock) -> None:
        for n, item in enumerate(b.items):
            if b.ordered:
                marker = f"{n + 1}. " if (self.in_bib and self.s.bibliography) else f"{n + 1}) "
            else:
                marker = "– "
            p = self._p()
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p.paragraph_format.first_line_indent = INDENT
            p.add_run(marker)
            self._add_text(p, item)

    def _quote(self, b: mdp.Quote) -> None:
        p = self._p()
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.left_indent = INDENT
        runs = mdp.parse_inline(b.text)
        for r in runs:
            r.italic = True
        self._add_runs(p, runs)

    def _spacer(self) -> None:
        p = self._p()
        p.paragraph_format.line_spacing = 1.0
        p.add_run("").font.size = SIZE_MAIN

    # ---------- код ----------

    def _code(self, b: mdp.CodeBlock) -> None:
        p = self._p()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        pf = p.paragraph_format
        pf.line_spacing = 1.15
        pf.space_before = Pt(8)
        pf.space_after = Pt(8)
        pf.left_indent = Cm(0)
        self._add_paragraph_border(p)
        lines = b.code.split("\n")
        for i, line in enumerate(lines):
            if i:
                p.add_run().add_break()
            run = p.add_run(line)
            run.font.name = FONT_CODE
            run.font.size = SIZE_SMALL

    # ---------- иллюстрации ----------

    def _figure_caption(self, caption: str | None) -> None:
        self.fig_n += 1
        if self.s.auto_number:
            text = f"Рисунок {self.fig_n} — {caption}" if caption else f"Рисунок {self.fig_n}"
        else:
            text = caption or ""
        if not text:
            return
        p = self._p()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(14)
        self._add_text(p, text)

    # Иллюстрация должна помещаться на странице вместе с подписью:
    # контентная область 165×257 мм, оставляем запас под подпись.
    MAX_IMG_W_MM = 150
    MAX_IMG_H_MM = 180

    def _add_image(self, data: bytes) -> bool:
        try:
            img = DocxImage.from_blob(data)
            w_mm = img.px_width / (img.horz_dpi or 96) * 25.4
            h_mm = img.px_height / (img.vert_dpi or 96) * 25.4
            scale = min(self.MAX_IMG_W_MM / w_mm, self.MAX_IMG_H_MM / h_mm, 1.0)
            p = self._p()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(8)
            # Картинка не должна отрываться от своей подписи «Рисунок N — …».
            p.paragraph_format.keep_with_next = True
            p.add_run().add_picture(io.BytesIO(data), width=Mm(w_mm * scale))
            return True
        except Exception:
            log.warning("Failed to embed image", exc_info=True)
            return False

    def _placeholder_box(self, label: str) -> None:
        p = self._p()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pf = p.paragraph_format
        pf.line_spacing = 1.0
        pf.space_before = Pt(30)
        pf.space_after = Pt(30)
        p.paragraph_format.keep_with_next = True
        self._add_paragraph_border(p)
        run = p.add_run(label)
        run.font.size = SIZE_SMALL
        run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    def _figure(self, b: mdp.Figure) -> None:
        data = self.resolver.resolve(b.src)
        if not (data and self._add_image(data)):
            self._placeholder_box("Место для изображения")
        self._figure_caption(b.caption or b.alt or None)

    def _mermaid(self, b: mdp.MermaidBlock) -> None:
        data = self.resolver.next_mermaid()
        if not (data and self._add_image(data)):
            self._placeholder_box("Схема (mermaid) — изображение недоступно")
        self._figure_caption(b.caption or "Схема")

    # ---------- таблицы ----------

    def _table(self, b: mdp.Table) -> None:
        if not b.rows:
            return
        self.tab_n += 1
        if b.caption:
            cap = f"Таблица {self.tab_n} — {b.caption}"
        elif self.s.auto_number:
            cap = f"Таблица {self.tab_n}"
        else:
            cap = ""
        if cap:
            p = self._p()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(4)
            # Подпись «Таблица N — …» не отрывается от самой таблицы.
            p.paragraph_format.keep_with_next = True
            self._add_text(p, cap)

        cols = max(len(r) for r in b.rows)
        table = self.doc.add_table(rows=len(b.rows), cols=cols)
        # Строки таблицы не разрываются между страницами (w:cantSplit).
        for row in table.rows:
            tr_pr = row._tr.get_or_add_trPr()
            tr_pr.append(parse_xml(f'<w:cantSplit xmlns:w="{_W}"/>'))
        table.style = self.doc.styles["Table Grid"]
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = True
        for ri, row in enumerate(b.rows):
            for ci in range(cols):
                cell = table.cell(ri, ci)
                cell_p = cell.paragraphs[0]
                cell_p.paragraph_format.line_spacing = 1.15
                cell_p.alignment = (
                    WD_ALIGN_PARAGRAPH.CENTER if ri == 0 else WD_ALIGN_PARAGRAPH.LEFT
                )
                text = row[ci] if ci < len(row) else ""
                runs = mdp.parse_inline(text)
                if ri == 0:
                    for r in runs:
                        r.bold = True
                self._add_runs(cell_p, runs, base_size=SIZE_SMALL)
        # Отступ после таблицы.
        p = self._p()
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.space_after = Pt(8)

    # ---------- формулы ----------

    def _formula(self, b: mdp.MathBlock) -> None:
        self.form_n += 1
        p = self._p()
        pf = p.paragraph_format
        pf.space_before = Pt(21)
        pf.space_after = Pt(21)
        pf.first_line_indent = Cm(0)
        pf.tab_stops.add_tab_stop(Mm(CONTENT_WIDTH_MM / 2), WD_TAB_ALIGNMENT.CENTER)
        pf.tab_stops.add_tab_stop(Mm(CONTENT_WIDTH_MM), WD_TAB_ALIGNMENT.RIGHT)
        p.add_run().add_tab()
        omml = latex_to_omml_element(b.latex)
        if omml is not None:
            p._p.append(omml)
        else:
            run = p.add_run(b.latex)
            run.italic = True
        if self.s.auto_number:
            p.add_run().add_tab()
            p.add_run(f"({self.form_n})")

    # ---------- нумерация страниц ----------

    def _page_numbers(self) -> None:
        sec = self.doc.sections[0]
        if self.s.title_page:
            # Титульный лист входит в нумерацию, но номер не проставляется.
            sec.different_first_page_header_footer = True
            first_footer_p = sec.first_page_footer.paragraphs[0]
            first_footer_p.text = ""
        footer_p = sec.footer.paragraphs[0]
        footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        footer_p.paragraph_format.line_spacing = 1.0
        self._field(footer_p, "PAGE")
        for run in footer_p.runs:
            run.font.name = FONT_MAIN
            run.font.size = SIZE_SMALL
