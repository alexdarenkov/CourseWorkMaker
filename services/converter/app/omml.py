"""LaTeX → OMML (Office Math Markup Language) для вставки формул в DOCX."""

from __future__ import annotations

import logging

import latex2mathml.converter
import mathml2omml
from docx.oxml import parse_xml
from lxml import etree

log = logging.getLogger(__name__)

_OMML_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
_W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def latex_to_omml_element(latex: str) -> etree._Element | None:
    """Возвращает элемент <m:oMath> или None, если конвертация не удалась."""
    try:
        mathml = latex2mathml.converter.convert(latex)
        omml = mathml2omml.convert(mathml)
        if "<m:oMath" not in omml:
            omml = f"<m:oMath>{omml}</m:oMath>"
        # Гарантируем объявления пространств имён.
        wrapped = omml.replace(
            "<m:oMath",
            f'<m:oMath xmlns:m="{_OMML_NS}" xmlns:w="{_W_NS}"',
            1,
        )
        return parse_xml(wrapped)
    except Exception:
        log.warning("LaTeX->OMML conversion failed for: %s", latex, exc_info=True)
        return None
