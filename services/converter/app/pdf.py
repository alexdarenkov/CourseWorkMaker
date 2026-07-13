"""DOCX → PDF через LibreOffice (headless).

Простой `--convert-to pdf` не обновляет поле оглавления Word — в PDF осталась
бы заглушка «Оглавление обновится при открытии». Поэтому конвертация идёт
через Basic-макрос: открыть документ → обновить все индексы (TOC получает
реальные номера страниц по вёрстке LibreOffice) → экспортировать в PDF.

Каждая конвертация получает собственный профиль LibreOffice во временной
директории (-env:UserInstallation) — иначе параллельные запуски дерутся за
лок профиля. Макрос с путями конкретной конвертации кладётся в этот профиль.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

log = logging.getLogger(__name__)

CONVERT_TIMEOUT_S = 120
PNG_RENDER_TIMEOUT_S = 60
# Инициализированный при сборке образа профиль-шаблон (см. Dockerfile). Макрос
# в свежем профиле выполняется только после инициализации, поэтому шаблон
# обязателен (иначе делаем инициализирующий запуск на месте).
PROFILE_TEMPLATE = Path("/opt/lo-profile")

# Библиотека Basic в профиле пользователя: индекс библиотек (script.xlc),
# индекс модулей (script.xlb) и сам модуль (Module1.xba).
_SCRIPT_XLC = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE library:libraries PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "libraries.dtd">
<library:libraries xmlns:library="http://openoffice.org/2000/library" xmlns:xlink="http://www.w3.org/1999/xlink">
 <library:library library:name="Standard" xlink:href="$(USER)/basic/Standard/script.xlb/" xlink:type="simple" library:link="false"/>
</library:libraries>
"""

_SCRIPT_XLB = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE library:library PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "library.dtd">
<library:library xmlns:library="http://openoffice.org/2000/library" library:name="Standard" library:readonly="false" library:passwordprotected="false">
 <library:element library:name="Module1"/>
</library:library>
"""

_MODULE_XBA = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">
<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic">
<![CDATA[
Sub Convert
  Dim oDoc, oIndexes, i
  Dim args(0) As New com.sun.star.beans.PropertyValue
  args(0).Name = "Hidden"
  args(0).Value = True
  oDoc = StarDesktop.loadComponentFromURL("{src_url}", "_blank", 0, args())
  oDoc.refresh()
  oIndexes = oDoc.getDocumentIndexes()
  For i = 0 To oIndexes.getCount() - 1
    oIndexes.getByIndex(i).update()
  Next i
  Dim exp(0) As New com.sun.star.beans.PropertyValue
  exp(0).Name = "FilterName"
  exp(0).Value = "writer_pdf_Export"
  oDoc.storeToURL("{out_url}", exp())
  oDoc.close(False)
End Sub
]]>
</script:module>
"""


def _write_macro_profile(profile: Path, src: Path, out: Path) -> None:
    basic = profile / "user" / "basic"
    (basic / "Standard").mkdir(parents=True, exist_ok=True)
    (basic / "script.xlc").write_text(_SCRIPT_XLC, encoding="utf-8")
    (basic / "Standard" / "script.xlb").write_text(_SCRIPT_XLB, encoding="utf-8")
    module = _MODULE_XBA.replace("{src_url}", src.as_uri()).replace("{out_url}", out.as_uri())
    (basic / "Standard" / "Module1.xba").write_text(module, encoding="utf-8")


def _run_libreoffice(args: list[str], profile: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["libreoffice", "--headless", "--norestore", f"-env:UserInstallation={profile.as_uri()}", *args],
        capture_output=True,
        timeout=CONVERT_TIMEOUT_S,
    )


def docx_to_pdf(docx_bytes: bytes) -> bytes:
    with tempfile.TemporaryDirectory(prefix="lo-") as td:
        tmp = Path(td)
        src = tmp / "document.docx"
        out = tmp / "document.pdf"
        profile = tmp / "profile"
        src.write_bytes(docx_bytes)
        if PROFILE_TEMPLATE.exists():
            shutil.copytree(PROFILE_TEMPLATE, profile)
        else:
            _run_libreoffice(["--terminate_after_init"], profile)
        _write_macro_profile(profile, src, out)

        res = _run_libreoffice(
            ["vnd.sun.star.script:Standard.Module1.Convert?language=Basic&location=application"],
            profile,
        )
        if not out.exists():
            # Запасной путь: без обновления оглавления (в TOC будет заглушка),
            # но PDF пользователь всё же получит.
            log.warning(
                "LibreOffice macro convert failed (rc=%s): %s — falling back to --convert-to",
                res.returncode,
                res.stderr[-300:],
            )
            res = _run_libreoffice(["--convert-to", "pdf", "--outdir", str(tmp), str(src)], profile)
            if res.returncode != 0 or not out.exists():
                log.error("libreoffice failed: %s", res.stderr[-500:])
                raise RuntimeError("LibreOffice не смог сформировать PDF")
        return out.read_bytes()


def pdf_first_page_png(pdf_bytes: bytes, dpi: int = 150) -> bytes:
    """Первая страница PDF → PNG (pdftoppm из poppler-utils)."""
    with tempfile.TemporaryDirectory(prefix="pp-") as td:
        tmp = Path(td)
        src = tmp / "title.pdf"
        src.write_bytes(pdf_bytes)
        try:
            res = subprocess.run(
                [
                    "pdftoppm", "-png", "-singlefile", "-r", str(dpi),
                    "-f", "1", "-l", "1", str(src), str(tmp / "out"),
                ],
                capture_output=True,
                timeout=PNG_RENDER_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired as e:
            raise RuntimeError("Рендер титульного листа превысил таймаут") from e
        out = tmp / "out.png"
        if res.returncode != 0 or not out.exists():
            log.error("pdftoppm failed: %s", res.stderr[-300:])
            raise RuntimeError("Не удалось отрисовать первую страницу файла")
        return out.read_bytes()
