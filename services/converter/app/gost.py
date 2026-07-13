"""Сборка .docx по ГОСТ 7.32-2017.

Ключевые требования стандарта (разд. 6):
- А4, поля: левое 30 мм, правое 15 мм, верхнее и нижнее 20 мм (6.1.1);
- Times New Roman, кегль 14 пт, полуторный интервал, абзацный отступ 1,25 см (6.1.1);
- структурные заголовки (ВВЕДЕНИЕ, ЗАКЛЮЧЕНИЕ и т. д.) — прописными, по центру,
  без точки, каждый с новой страницы (6.2.1); разделы нумеруются арабскими цифрами
  без точки, заголовок с абзацного отступа, полужирный (6.2.3, 6.4.1);
- нумерация страниц — по центру нижней части листа, титульный лист входит
  в нумерацию, но номер на нём не проставляется (6.3.1, 6.3.2);
- «Рисунок N — Название» по центру под иллюстрацией (6.5.7), многострочная
  подпись — через один межстрочный интервал;
- «Таблица N — Название» слева над таблицей без абзацного отступа (6.6.3);
- формулы — отдельной строкой по центру, номер в круглых скобках в крайнем
  правом положении, по свободной строке до и после (6.8.1, 6.8.3); пояснения
  «где …» — каждое отдельным абзацем с красной строки;
- содержание: записи влево, номера страниц справа через отточие (6.13);
  подразделы с отступом 0,5 см, пункты — 1 см; реферат идёт ДО содержания
  и в него не включается;
- список использованных источников: нумерация арабскими цифрами БЕЗ точки,
  с абзацного отступа, как обычный текст (6.16);
- номера страниц — тем же шрифтом и кеглем, что основной текст (14 пт).
"""

from __future__ import annotations

import io
import logging
import re

from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
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

# Управляющие символы, недопустимые в XML 1.0 (кроме \t \n \r). Если они попадут
# в текст рана (битый ввод, остаточный плейсхолдер инлайн-парсера), python-docx /
# lxml падает с «All strings must be XML compatible» — поэтому вырезаем их.
_BAD_XML_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _xml_safe(text: str) -> str:
    return _BAD_XML_CHARS.sub("", text)


FONT_MAIN = "Times New Roman"
FONT_CODE = "Courier New"
SIZE_MAIN = Pt(14)
SIZE_SMALL = Pt(12)
INDENT = Cm(1.25)
CONTENT_WIDTH_MM = 165  # 210 - 30 - 15
LINE_15 = 1.5
# Реальная высота строки Word/LibreOffice при «полуторном» интервале: 1,5 ×
# собственная высота строки шрифта (hhea-метрики), а НЕ 1,5 em. Для Times New
# Roman собственная высота = 1,15 em → 14 пт × 1,15 × 1,5 = 24,15 пт (замерено
# по PDF LibreOffice; превью использует line-height:1.725 — ту же величину).
LINE_PT = Pt(24.15)
# «Свободная строка» вокруг формул/таблиц/рисунков — как межабзацный интервал,
# а не пустой абзац (Word гасит его на границе страницы → не «висит» вверху).
# Высота — полная строка текста (см. LINE_PT), как blank-строка в превью.
FREE_LINE = LINE_PT
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
        self.ol_n = 0
        self._setup_page()
        self._setup_styles()

    # ---------- документ ----------

    def build(self, blocks: list[mdp.Block]) -> None:
        if self.s.title_page:
            custom = self.resolver.resolve(self.s.title_custom) if self.s.title_custom else None
            if custom is None or not self._custom_title_page(custom):
                self._title_page()
        # Реферат — первый заголовок документа: его страница идёт ДО содержания
        # и в содержание не включается (ГОСТ 7.32: титульный лист → реферат →
        # содержание).
        ref_blocks, rest = self._split_referat(blocks)
        if ref_blocks:
            self._render_blocks(
                ref_blocks, allow_first_break=self.s.title_page, referat=True
            )
        if self.s.toc:
            self._toc(page_break_before=bool(ref_blocks))
        self._render_blocks(
            rest,
            allow_first_break=self.s.title_page or self.s.toc or bool(ref_blocks),
        )
        if self.s.page_numbers:
            self._page_numbers()

    @staticmethod
    def _split_referat(blocks: list[mdp.Block]) -> tuple[list[mdp.Block], list[mdp.Block]]:
        """Отделяет реферат (первый заголовок документа «Реферат» и его блоки
        до следующего раздела) от остального содержимого."""
        for idx, blk in enumerate(blocks):
            if isinstance(blk, mdp.Heading):
                if blk.level == 1 and re.match(r"^реферат\b", blk.text.strip(), re.IGNORECASE):
                    end = next(
                        (
                            j
                            for j in range(idx + 1, len(blocks))
                            if isinstance(blocks[j], mdp.Heading) and blocks[j].level == 1
                        ),
                        len(blocks),
                    )
                    return blocks[:end], blocks[end:]
                break
            if not isinstance(blk, mdp.Blank):
                break
        return [], blocks

    def _render_blocks(
        self, blocks: list[mdp.Block], allow_first_break: bool, referat: bool = False
    ) -> None:
        first_h1_seen = False
        skip_next = False
        # «Свободная строка» вокруг формул/таблиц/рисунков/листингов — это
        # НАСТОЯЩИЙ пустой абзац (перенос строки), как в превью и как в
        # документах, набранных вручную: нормоконтроль ждёт пустую строку, а
        # не межабзацный интервал (space_before). Пустой абзац Word показывает
        # и в начале страницы — превью ведёт себя так же (blank-блоки больше
        # не гасятся пагинатором). Свободная строка «после блока» и «до
        # следующего» — ОДНА на двоих (дедуп через pending_free: после таблицы
        # перед рисунком — одна пустая строка, не две).
        pending_free = False
        # Предыдущий блок — формула: подряд идущие формулы НЕ разделяются
        # свободными строками (переносы только между текстом и формулами).
        after_math = False
        for i, b in enumerate(blocks):
            if skip_next:
                skip_next = False
                continue
            prev_math = after_math
            after_math = False
            # Свободная строка ПЕРЕД таблицей/рисунком/схемой/формулой (кроме
            # формулы сразу после формулы); листинг вставляет свой спейсер сам
            # (_code), поэтому в needs_lead не входит.
            needs_lead = isinstance(b, (mdp.Figure, mdp.Table, mdp.MermaidBlock)) or (
                isinstance(b, mdp.MathBlock) and not prev_math
            )
            if pending_free or needs_lead:
                self._blank_line()
            pending_free = False
            # Сквозная нумерация: список типа «1)» продолжается через подряд
            # идущие ListBlock(ordered=True) (пустые строки между пунктами не
            # прерывают список), любой другой блок обнуляет счётчик.
            if not (isinstance(b, mdp.ListBlock) and b.ordered) and not isinstance(b, mdp.Blank):
                self.ol_n = 0
            if isinstance(b, mdp.Heading):
                self._heading(
                    b,
                    allow_break=first_h1_seen or allow_first_break,
                    exclude_from_toc=referat and b.level == 1,
                )
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
                # Свободная строка ДО формулы уже вставлена (needs_lead), но
                # НЕ между формулами подряд. Если за формулой «где …» —
                # пояснение идёт вплотную, свободная строка после него, и
                # формула не отрывается от пояснения при переносе страницы.
                nxt = blocks[i + 1] if i + 1 < len(blocks) else None
                has_gde = isinstance(nxt, mdp.Paragraph) and mdp.split_gde(nxt.text) is not None
                self._formula(b, keep_next=has_gde)
                if has_gde:
                    self._paragraph(nxt.text)
                    skip_next = True
                after_math = True
            elif isinstance(b, mdp.Figure):
                self._figure(b)
            elif isinstance(b, mdp.Table):
                self._table(b)
            elif isinstance(b, mdp.Quote):
                self._quote(b)
            elif isinstance(b, mdp.PageBreak):
                self.doc.add_page_break()
            elif isinstance(b, mdp.Blank):
                self._blank_line()
            elif isinstance(b, mdp.HRule):
                self._spacer()
            # Этому блоку нужна свободная строка ПОСЛЕ него? (вставится перед
            # следующим блоком — pending_free, один пустой абзац на двоих)
            if isinstance(b, mdp.MathBlock):
                # После «где» — всегда (это текст); после «голой» формулы —
                # только если дальше не формула (формулы подряд идут вплотную).
                idx_next = i + 2 if skip_next else i + 1
                next_is_math = idx_next < len(blocks) and isinstance(
                    blocks[idx_next], mdp.MathBlock
                )
                pending_free = has_gde or not next_is_math
            elif isinstance(b, (mdp.Figure, mdp.Table, mdp.MermaidBlock, mdp.CodeBlock)):
                pending_free = True

    # ---------- страница и стили ----------

    def _setup_page(self) -> None:
        self._apply_page_format(self.doc.sections[0])

    @staticmethod
    def _apply_page_format(sec) -> None:
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

        # Заголовки — БЕЗ дополнительных интервалов до/после: между заголовком
        # и текстом (и между заголовками) остаётся обычный полуторный
        # межстрочный интервал. Парно с превью (renderAll в gostRender.ts:
        # заголовки без спейсеров и padding).
        for name in ("Heading 1", "Heading 2", "Heading 3"):
            st = self.doc.styles[name]
            st.font.name = FONT_MAIN
            st.font.size = SIZE_MAIN
            st.font.bold = True
            st.font.color.rgb = RGBColor(0, 0, 0)
            st.paragraph_format.line_spacing = LINE_15
            st.paragraph_format.space_before = Pt(0)
            st.paragraph_format.space_after = Pt(0)
            st.paragraph_format.keep_with_next = True

        # Стили оглавления (используются Word при обновлении поля TOC):
        # подразделы сдвигаются на 0,5 см, пункты — на 1 см; записи НЕ
        # разреженные (в превью те же отступы в buildTocRow).
        for toc_name, indent in (("TOC 1", Cm(0)), ("TOC 2", Cm(0.5)), ("TOC 3", Cm(1.0))):
            try:
                st = self.doc.styles[toc_name]
            except KeyError:
                from docx.enum.style import WD_STYLE_TYPE

                st = self.doc.styles.add_style(toc_name, WD_STYLE_TYPE.PARAGRAPH, builtin=True)
            st.font.name = FONT_MAIN
            st.font.size = SIZE_MAIN
            st.paragraph_format.line_spacing = LINE_15
            # Явные нули: стили TOC создаются без basedOn и иначе наследуют
            # docDefaults шаблона python-docx (space_after 8 пт) — содержание
            # выходило «разреженным», записи заметно дальше друг от друга,
            # чем в превью (buildTocRow: чистые строки 1.5 без отступов).
            st.paragraph_format.space_before = Pt(0)
            st.paragraph_format.space_after = Pt(0)
            st.paragraph_format.left_indent = indent
            st.paragraph_format.first_line_indent = Cm(0)

    # ---------- низкоуровневые помощники ----------

    def _p(self, style: str | None = None):
        return self.doc.add_paragraph(style=style)

    def _add_runs(self, p, runs: list[mdp.InlineRun], base_size=SIZE_MAIN, bold=False) -> None:
        for r in runs:
            if r.math is not None:
                omml = latex_to_omml_element(r.math)
                if omml is not None:
                    p._p.append(omml)
                    continue
                run = p.add_run(_xml_safe(r.math))
                run.italic = True
                run.font.name = FONT_MAIN
                run.font.size = base_size
                continue
            # Длинное тире «—» → среднее «–» в обычном тексте (код оставляем как есть).
            text = r.text if r.code else r.text.replace("—", "–")
            run = p.add_run(_xml_safe(text))
            run.bold = r.bold or bold
            run.italic = r.italic
            run.underline = r.underline
            if r.code:
                run.font.name = FONT_CODE
                run.font.size = Pt(13)
            else:
                # Явный шрифт на каждом run: иначе заголовки берут тематический
                # шрифт стиля (не Times New Roman).
                run.font.name = FONT_MAIN
                run.font.size = base_size

    def _add_text(self, p, text: str, base_size=SIZE_MAIN, bold=False) -> None:
        # «\n» — принудительный перенос строки (от «\» в конце строки исходника).
        for si, seg in enumerate(text.split("\n")):
            if si:
                p.add_run().add_break()
            self._add_runs(p, mdp.parse_inline(seg), base_size, bold)

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

    @staticmethod
    def _is_upper_line(line: str) -> bool:
        """Строка «вся прописными» (тип работы) — крупнее и полужирно."""
        return len(line) > 2 and line == line.upper() and bool(re.search(r"[А-ЯA-ZЁ]", line))

    @staticmethod
    def _img_dpi(dpi: int | None) -> int:
        """Плотность картинки для пересчёта px → мм. 72 dpi — заглушка
        python-docx для картинок без метаданных (canvas-PNG, скриншоты) —
        превью считает такие картинки по 96 dpi, делаем так же. Явная
        плотность (pHYs у mermaid-PNG, matplotlib) используется как есть."""
        return 96 if not dpi or dpi == 72 else dpi

    def _title_logo(self) -> None:
        data = self.resolver.resolve(self.s.title_logo) if self.s.title_logo else None
        if not data:
            return
        try:
            img = DocxImage.from_blob(data)
            w_mm = img.px_width / self._img_dpi(img.horz_dpi) * 25.4
            h_mm = img.px_height / self._img_dpi(img.vert_dpi) * 25.4
            scale = min(60 / w_mm, 40 / h_mm, 1.0)
            p = self._p()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(14)
            p.add_run().add_picture(io.BytesIO(data), width=Mm(w_mm * scale))
        except Exception:
            log.warning("Failed to embed title logo", exc_info=True)

    def _custom_title_page(self, data: bytes) -> bool:
        """Пользовательский титульник: картинка (отрендеренная страница его
        PDF/DOCX) на всю первую страницу в секции без полей; контент идёт со
        второй секции с ГОСТ-полями. False — картинка не читается, тогда
        строится обычный сгенерированный титульник."""
        try:
            DocxImage.from_blob(data)
        except Exception:
            log.warning("Custom title image unreadable", exc_info=True)
            return False
        sec = self.doc.sections[0]
        sec.left_margin = Mm(0)
        sec.right_margin = Mm(0)
        sec.top_margin = Mm(0)
        sec.bottom_margin = Mm(0)
        sec.header_distance = Mm(0)
        sec.footer_distance = Mm(0)
        p = self._p()
        pf = p.paragraph_format
        pf.line_spacing = 1.0
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        p.add_run().add_picture(io.BytesIO(data), width=Mm(210), height=Mm(297))
        self._apply_page_format(self.doc.add_section(WD_SECTION_START.NEW_PAGE))
        return True

    def _title_page(self) -> None:
        """Титульный лист из свободных блоков (см. GostSettings)."""
        s = self.s
        for line in (l.strip() for l in s.title_header.split("\n")):
            if line:
                self._title_line(line, spacing=1.4)
        self._title_logo()
        self._empty_lines(3 if s.title_logo else 6)

        for line in (l.strip() for l in s.title_work.split("\n")):
            if not line:
                continue
            if self._is_upper_line(line):
                self._title_line(line, bold=True, size=Pt(18), spacing=1.4)
            else:
                self._title_line(line, size=SIZE_MAIN, spacing=1.4)
        topic = s.topic.strip()
        if topic:
            quoted = topic if topic.startswith(("«", '"')) else f"«{topic}»"
            self._title_line(quoted, bold=True, size=SIZE_MAIN, spacing=1.4)
        self._empty_lines(7)

        # Исполнители: «Метка: текст» → метка слева, текст у правого поля
        # (правый таб); строки без метки — по правому полю; пустая — отступ.
        for raw in s.title_people.split("\n"):
            line = raw.strip()
            p = self._p()
            pf = p.paragraph_format
            pf.line_spacing = 1.4
            if not line:
                p.add_run("").font.size = Pt(13)
                continue
            pf.tab_stops.add_tab_stop(Mm(CONTENT_WIDTH_MM), WD_TAB_ALIGNMENT.RIGHT)
            m = re.match(r"^([^:]{1,24}):\s*(.*)$", line)
            if m:
                r = p.add_run(m.group(1) + ":")
                r.font.size = Pt(13)
                p.add_run().add_tab()
                r = p.add_run(m.group(2))
                r.font.size = Pt(13)
            else:
                p.add_run().add_tab()
                r = p.add_run(line)
                r.font.size = Pt(13)

        self._empty_lines(6)
        for line in (l.strip() for l in s.title_bottom.split("\n")):
            if line:
                self._title_line(line, size=Pt(13))

        self.doc.add_page_break()

    # ---------- содержание ----------

    def _toc(self, page_break_before: bool = False) -> None:
        p = self._p(style="Heading 1")
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.first_line_indent = Cm(0)
        # После реферата содержание начинается с новой страницы.
        if page_break_before:
            p.paragraph_format.page_break_before = True
        # Заголовок «СОДЕРЖАНИЕ» не должен попадать в само оглавление —
        # понижаем уровень структуры до «обычный текст».
        p.paragraph_format.element.get_or_add_pPr().append(
            parse_xml(f'<w:outlineLvl xmlns:w="{_W}" w:val="9"/>')
        )
        run = p.add_run("СОДЕРЖАНИЕ")
        run.font.name = FONT_MAIN

        toc_p = self._p()
        pf = toc_p.paragraph_format
        pf.tab_stops.add_tab_stop(
            Mm(CONTENT_WIDTH_MM), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS
        )
        self._field(
            toc_p,
            r'TOC \o "1-3" \h \z \u',
            "Оглавление обновится при открытии (или выделить и нажать F9)",
        )
        # Оглавление обновляется автоматически при открытии (Word спросит
        # «обновить поля?» — нажать «Да», тогда содержание заполнится).
        self._update_fields_on_open()
        self.doc.add_page_break()

    def _update_fields_on_open(self) -> None:
        settings = self.doc.settings.element
        if settings.find(qn("w:updateFields")) is None:
            settings.append(parse_xml(f'<w:updateFields xmlns:w="{_W}" w:val="true"/>'))

    # ---------- заголовки ----------

    def _heading(self, b: mdp.Heading, allow_break: bool, exclude_from_toc: bool = False) -> None:
        text = b.text.strip()
        if b.level == 1:
            structural = mdp.is_structural(text)
            self.in_bib = bool(re.match(r"^список", text, re.IGNORECASE))
            p = self._p(style="Heading 1")
            if allow_break:
                p.paragraph_format.page_break_before = True
            if exclude_from_toc:
                # Реферат не включается в содержание — понижаем уровень
                # структуры до «обычный текст» (как у заголовка СОДЕРЖАНИЕ).
                p.paragraph_format.element.get_or_add_pPr().append(
                    parse_xml(f'<w:outlineLvl xmlns:w="{_W}" w:val="9"/>')
                )
            if structural:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.first_line_indent = Cm(0)
                self._add_text(p, text.upper(), bold=True)
            else:
                self.sec_n += 1
                self.sub_n = 0
                self.sub2_n = 0
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.paragraph_format.first_line_indent = INDENT
                self._num_run(p, f"{self.sec_n}{NBSP}")
                self._add_text(p, text, bold=True)
        elif b.level == 2:
            self.sub_n += 1
            self.sub2_n = 0
            p = self._p(style="Heading 2")
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.first_line_indent = INDENT
            # Номер только внутри нумерованного раздела; подразделы структурных
            # элементов (Введение/Заключение) и до первого раздела — без номера.
            if self.sec_n > 0:
                self._num_run(p, f"{self.sec_n}.{self.sub_n}{NBSP}")
            self._add_text(p, text, bold=True)
        else:
            self.sub2_n += 1
            p = self._p(style="Heading 3")
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.first_line_indent = INDENT
            if self.sec_n > 0:
                self._num_run(p, f"{self.sec_n}.{self.sub_n}.{self.sub2_n}{NBSP}")
            self._add_text(p, text, bold=True)

    def _num_run(self, p, text: str) -> None:
        """Номер заголовка: явный шрифт Times New Roman, полужирный."""
        run = p.add_run(text)
        run.font.name = FONT_MAIN
        run.bold = True

    def _blank_line(self) -> None:
        """Свободная строка (пустой абзац, полуторный интервал)."""
        p = self._p()
        p.paragraph_format.first_line_indent = Cm(0)

    # ---------- основной текст ----------

    def _paragraph(self, text: str) -> None:
        gde = mdp.split_gde(text)
        if gde is not None:
            # Пояснения к формуле («где …»): каждое пояснение — отдельным
            # абзацем с красной строки (и «где», и все последующие).
            for line in gde:
                p = self._p()
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.paragraph_format.first_line_indent = INDENT
                self._add_text(p, line)
            return
        p = self._p()
        # Абзац с ручными переносами — по левому краю (иначе выравнивание по
        # ширине растягивает короткие строки перед переносом).
        p.alignment = (
            WD_ALIGN_PARAGRAPH.LEFT if "\n" in text else WD_ALIGN_PARAGRAPH.JUSTIFY
        )
        p.paragraph_format.first_line_indent = INDENT
        self._add_text(p, text)

    def _list(self, b: mdp.ListBlock) -> None:
        # Пункт перечисления — как обычный абзац с красной строки: маркер
        # («–» или «N)») на абзацном отступе, продолжение длинного пункта
        # переносится к ЛЕВОМУ полю — без висячего отступа. NBSP после
        # маркера — текст не отрывается от маркера при переносе строки.
        # Список источников: номер С ТОЧКОЙ («1.») — требование пользователя
        # (2026-07-12; выписка ГОСТ 6.16 говорит «без точки», но вуз требует
        # с точкой), той же вёрсткой с красной строки.
        for item in b.items:
            marker = "–"
            if b.ordered:
                self.ol_n += 1
                marker = (
                    f"{self.ol_n}."
                    if self.in_bib and self.s.bibliography
                    else f"{self.ol_n})"
                )
            p = self._p()
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p.paragraph_format.first_line_indent = INDENT
            p.add_run(f"{marker}{NBSP}")
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

    @staticmethod
    def _mm_to_dxa(mm: float) -> int:
        return round(mm / 25.4 * 1440)

    def _set_table_full_width(self, table) -> None:
        """Таблица всегда занимает 100% ширины контентной области (w:tblW pct)."""
        tbl_pr = table._tbl.tblPr
        tbl_w = tbl_pr.find(qn("w:tblW"))
        if tbl_w is None:
            tbl_w = parse_xml(f'<w:tblW xmlns:w="{_W}" w:type="pct" w:w="5000"/>')
            tbl_pr.insert_element_before(
                tbl_w,
                "w:jc", "w:tblCellSpacing", "w:tblInd", "w:tblBorders", "w:shd",
                "w:tblLayout", "w:tblCellMar", "w:tblLook", "w:tblCaption",
                "w:tblDescription",
            )
        else:
            tbl_w.set(qn("w:type"), "pct")
            tbl_w.set(qn("w:w"), "5000")

    def _set_cell_margins(self, table, top_mm: float, side_mm: float) -> None:
        """Внутренние отступы ячеек (в превью это padding у th/td)."""
        top = self._mm_to_dxa(top_mm)
        side = self._mm_to_dxa(side_mm)
        mar = (
            f'<w:tblCellMar xmlns:w="{_W}">'
            f'<w:top w:w="{top}" w:type="dxa"/><w:left w:w="{side}" w:type="dxa"/>'
            f'<w:bottom w:w="{top}" w:type="dxa"/><w:right w:w="{side}" w:type="dxa"/>'
            "</w:tblCellMar>"
        )
        tbl_pr = table._tbl.tblPr
        old = tbl_pr.find(qn("w:tblCellMar"))
        if old is not None:
            tbl_pr.remove(old)
        tbl_pr.append(parse_xml(mar))

    def _code(self, b: mdp.CodeBlock) -> None:
        # Листинг — таблица 1×1, а не параграф с рамкой: границы ячейки Word
        # замыкает на каждой странице при переносе, параграфную рамку — нет.
        # Свободная строка перед листингом — собственный спейсер (поэтому
        # листинг не входит в needs_lead build()); после — пустой абзац
        # через pending_free в build().
        spacer = self._p()
        spacer.paragraph_format.line_spacing = FREE_LINE
        table = self.doc.add_table(rows=1, cols=1)
        table.style = self.doc.styles["Table Grid"]
        self._set_table_full_width(table)
        self._set_cell_margins(table, top_mm=3, side_mm=4)  # как padding в превью
        p = table.cell(0, 0).paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.line_spacing = LINE_15
        for i, line in enumerate(b.code.split("\n")):
            if i:
                p.add_run().add_break()
            run = p.add_run(line)
            run.font.name = FONT_CODE
            run.font.size = SIZE_SMALL

    # ---------- иллюстрации ----------

    def _figure_caption(self, caption: str | None) -> None:
        self.fig_n += 1
        if self.s.auto_number:
            text = f"Рисунок {self.fig_n} – {caption}" if caption else f"Рисунок {self.fig_n}"
        else:
            text = caption or ""
        if not text:
            return
        p = self._p()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.first_line_indent = Cm(0)
        p.paragraph_format.space_after = Pt(0)
        # Многострочная подпись — через ОДИН межстрочный интервал (в превью
        # line-height:1.15 — собственная высота строки Times New Roman).
        p.paragraph_format.line_spacing = 1.0
        self._add_text(p, text)
        # Свободная строка после подписи рисунка задаётся в build()
        # (space_before следующего блока), пустой абзац не нужен.

    # Иллюстрация должна помещаться на странице вместе с подписью:
    # контентная область 165×257 мм, оставляем запас под подпись.
    MAX_IMG_W_MM = 150
    MAX_IMG_H_MM = 180

    def _add_image(self, data: bytes) -> bool:
        try:
            img = DocxImage.from_blob(data)
            w_mm = img.px_width / self._img_dpi(img.horz_dpi) * 25.4
            h_mm = img.px_height / self._img_dpi(img.vert_dpi) * 25.4
            scale = min(self.MAX_IMG_W_MM / w_mm, self.MAX_IMG_H_MM / h_mm, 1.0)
            p = self._p()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            # Свободная строка перед иллюстрацией — настоящий пустой абзац,
            # его вставляет build() (needs_lead).
            # Картинка не должна отрываться от своей подписи «Рисунок N — …».
            p.paragraph_format.keep_with_next = True
            p.add_run().add_picture(io.BytesIO(data), width=Mm(w_mm * scale))
            return True
        except Exception:
            log.warning("Failed to embed image", exc_info=True)
            return False

    # Заглушка отсутствующей картинки — рамка тех же габаритов, что в превью
    # (placeholder в gostRender.ts): иначе высота блока (и раскладка страниц)
    # расходились бы с превью.
    PLACEHOLDER_W_MM = 125
    PLACEHOLDER_H_MM = 62

    def _placeholder_box(self, label: str) -> None:
        # Свободная строка перед заглушкой — пустой абзац из build()
        # (needs_lead), собственный спейсер не нужен.
        table = self.doc.add_table(rows=1, cols=1)
        table.style = self.doc.styles["Table Grid"]
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        for gc in table._tbl.tblGrid.findall(qn("w:gridCol")):
            gc.set(qn("w:w"), str(self._mm_to_dxa(self.PLACEHOLDER_W_MM)))
        row = table.rows[0]
        row.cells[0].width = Mm(self.PLACEHOLDER_W_MM)
        tr_pr = row._tr.get_or_add_trPr()
        tr_pr.append(
            parse_xml(
                f'<w:trHeight xmlns:w="{_W}" w:val="{self._mm_to_dxa(self.PLACEHOLDER_H_MM)}" '
                'w:hRule="exact"/>'
            )
        )
        cell = row.cells[0]
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.line_spacing = 1.0
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
        # Как у рисунков: номер подписи только при включённой автонумерации.
        if self.s.auto_number:
            cap = f"Таблица {self.tab_n} – {b.caption}" if b.caption else f"Таблица {self.tab_n}"
        else:
            cap = b.caption or ""
        if cap:
            p = self._p()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.first_line_indent = Cm(0)
            # Свободная строка перед подписью — пустой абзац из build()
            # (needs_lead). Между подписью и таблицей — нулевой отступ;
            # многострочная подпись — через ОДИН межстрочный интервал, как у
            # рисунков (в превью — line-height:1.15 у capHtml).
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            # Подпись «Таблица N — …» не отрывается от самой таблицы.
            p.paragraph_format.keep_with_next = True
            self._add_text(p, cap)

        cols = max(len(r) for r in b.rows)
        # Широкая таблица — уменьшенный кегль (ГОСТ 6.6 допускает); правило
        # синхронизировано с превью: >6 колонок → 12 пт.
        cell_size = SIZE_MAIN if cols <= 6 else SIZE_SMALL
        table = self.doc.add_table(rows=len(b.rows), cols=cols)
        # Строки таблицы не разрываются между страницами (w:cantSplit).
        for row in table.rows:
            tr_pr = row._tr.get_or_add_trPr()
            tr_pr.append(parse_xml(f'<w:cantSplit xmlns:w="{_W}"/>'))
        # Шапка повторяется на каждой странице многостраничной таблицы
        # (w:tblHeader) — как это делает пагинатор превью.
        if len(b.rows) > 1:
            table.rows[0]._tr.get_or_add_trPr().append(
                parse_xml(f'<w:tblHeader xmlns:w="{_W}"/>')
            )
        table.style = self.doc.styles["Table Grid"]
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        # Фиксированная раскладка: ширины колонок считаются тем же алгоритмом,
        # что в превью (вес = длина самого длинного содержимого, кламп 3..30) —
        # авто-раскладки Word и Chrome делят ширину по-разному, из-за чего
        # высота таблицы (и число страниц) расходились.
        table.autofit = False
        # 100% ширины (иначе Word раздувает широкую таблицу за поля) и отступы
        # ячеек как в превью (padding 1.5мм/2мм) — вертикальные отступы Word по
        # умолчанию нулевые, из-за чего таблицы в DOCX были ниже, чем в превью.
        self._set_table_full_width(table)
        self._set_cell_margins(table, top_mm=1.5, side_mm=2)
        weights = [
            max(3, min(30, max((len(row[ci]) if ci < len(row) else 0) for row in b.rows)))
            for ci in range(cols)
        ]
        weight_sum = sum(weights)
        col_mm = [CONTENT_WIDTH_MM * w / weight_sum for w in weights]
        # Ширины колонок живут в сетке таблицы (w:tblGrid/w:gridCol) — Word и
        # LibreOffice при фиксированной раскладке читают именно её; tcW ячеек
        # задаём тоже (некоторые версии Word смотрят на них).
        for gc, mm in zip(table._tbl.tblGrid.findall(qn("w:gridCol")), col_mm):
            gc.set(qn("w:w"), str(self._mm_to_dxa(mm)))
        for row in table.rows:
            for ci, cell in enumerate(row.cells):
                cell.width = Mm(col_mm[ci])
        for ri, row in enumerate(b.rows):
            for ci in range(cols):
                cell = table.cell(ri, ci)
                cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                cell_p = cell.paragraphs[0]
                cell_p.paragraph_format.line_spacing = LINE_15
                cell_p.alignment = WD_ALIGN_PARAGRAPH.CENTER  # все ячейки по центру
                # Шапка не остаётся одна внизу страницы: keep_with_next
                # прилипляет её к первой строке тела — если вместе они не
                # влезают, вся таблица уезжает на новую страницу (в превью то
                # же правило: minFirst = подпись+шапка+строка в paginate.ts).
                # Заодно обход бага LibreOffice: tblHeader-строка, оторванная
                # разрывом страницы от тела, теряла при экспорте в PDF ВСЕ
                # строки тела таблицы.
                if ri == 0 and len(b.rows) > 1:
                    cell_p.paragraph_format.keep_with_next = True
                text = row[ci] if ci < len(row) else ""
                runs = mdp.parse_inline(text)
                if ri == 0:
                    for r in runs:
                        r.bold = True
                self._add_runs(cell_p, runs, base_size=cell_size)
        # Свободная строка после таблицы добавляется как space_before
        # следующего блока (см. build()), пустой абзац не нужен.

    # ---------- формулы ----------

    def _formula(self, b: mdp.MathBlock, keep_next: bool = False) -> None:
        self.form_n += 1
        p = self._p()
        pf = p.paragraph_format
        # Свободные строки вокруг формулы — настоящие пустые абзацы, их
        # вставляет build() (needs_lead/pending_free); сама формула без
        # межабзацных интервалов.
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        # Формула с пояснением «где …» не разрывается между страницами.
        if keep_next:
            pf.keep_with_next = True
        pf.first_line_indent = Cm(0)
        pf.tab_stops.add_tab_stop(Mm(CONTENT_WIDTH_MM / 2), WD_TAB_ALIGNMENT.CENTER)
        pf.tab_stops.add_tab_stop(Mm(CONTENT_WIDTH_MM), WD_TAB_ALIGNMENT.RIGHT)
        p.add_run().add_tab()
        omml = latex_to_omml_element(b.latex, display=True)
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
        secs = self.doc.sections
        if len(secs) > 1:
            # Кастомный титул — отдельная секция без номера; нумерация идёт в
            # контентной секции (титул входит в счёт, но номер не печатается).
            footer = secs[1].footer
            footer.is_linked_to_previous = False
            footer_p = footer.paragraphs[0]
        else:
            sec = secs[0]
            if self.s.title_page:
                # Титульный лист входит в нумерацию, но номер не проставляется.
                sec.different_first_page_header_footer = True
                first_footer_p = sec.first_page_footer.paragraphs[0]
                first_footer_p.text = ""
            footer_p = sec.footer.paragraphs[0]
        footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        footer_p.paragraph_format.line_spacing = 1.0
        self._field(footer_p, "PAGE")
        # Номер страницы — тем же шрифтом и кеглем, что основной текст.
        for run in footer_p.runs:
            run.font.name = FONT_MAIN
            run.font.size = SIZE_MAIN
