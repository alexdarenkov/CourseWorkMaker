"""LaTeX → OMML через Pandoc — формулы вставляются в DOCX как родные уравнения Word.

Pandoc даёт высококачественный OMML (дроби, суммы, индексы), поэтому формула
конвертируется так: `$latex$` → pandoc → docx → извлекаем элемент <m:oMath>.
Результат кэшируется (формулы часто повторяются).
"""

from __future__ import annotations

import functools
import io
import logging
import re
import subprocess
import zipfile

from docx.oxml import parse_xml
from lxml import etree

log = logging.getLogger(__name__)

_OMML_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
_W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

_OMATH_RE = re.compile(r"<m:oMath[ >].*?</m:oMath>", re.DOTALL)


@functools.lru_cache(maxsize=512)
def _pandoc_omml(latex: str, display: bool) -> str | None:
    """Гоняет одну формулу через pandoc и возвращает строку <m:oMath> или None."""
    src = f"$$\n{latex}\n$$\n" if display else f"${latex}$\n"
    try:
        res = subprocess.run(
            ["pandoc", "-f", "markdown", "-t", "docx", "-o", "-"],
            input=src.encode("utf-8"),
            capture_output=True,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        log.warning("pandoc недоступен/таймаут: %s", e)
        return None
    if res.returncode != 0 or not res.stdout:
        log.warning("pandoc вернул ошибку для формулы: %s", res.stderr[-200:])
        return None
    try:
        with zipfile.ZipFile(io.BytesIO(res.stdout)) as z:
            doc_xml = z.read("word/document.xml").decode("utf-8")
    except (zipfile.BadZipFile, KeyError):
        return None
    m = _OMATH_RE.search(doc_xml)
    if not m:
        return None
    omml = m.group(0)
    # Pandoc объявляет пространства имён в корне документа — на извлечённом
    # фрагменте их нет, добавляем (нужны m: и w:).
    head = omml[: omml.index(">")]
    if "xmlns:m=" not in head:
        omml = omml.replace(
            "<m:oMath", f'<m:oMath xmlns:m="{_OMML_NS}" xmlns:w="{_W_NS}"', 1
        )
    return omml


def latex_to_omml_element(latex: str, display: bool = False) -> etree._Element | None:
    """Возвращает элемент <m:oMath> или None, если конвертация не удалась."""
    omml = _pandoc_omml(latex.strip(), display)
    if not omml:
        return None
    try:
        return parse_xml(omml)
    except Exception:
        log.warning("Не удалось разобрать OMML от pandoc для: %s", latex, exc_info=True)
        return None
