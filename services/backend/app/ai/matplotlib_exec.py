"""Песочница для matplotlib-скриптов, которые пишет ИИ-агент.

Скрипт проверяется через AST (блокировка опасных конструкций) и запускается
в изолированном подпроцессе с лимитами по времени, памяти и CPU. Результат —
PNG-байты, которые встраиваются в отчёт как иллюстрация.

Это тот же принцип, что у Claude Code: модель пишет скрипт, а исполняет его
отдельная песочница; сама LLM ничего не «рисует».
"""

from __future__ import annotations

import ast
import base64
import logging
import subprocess
import sys
import textwrap

log = logging.getLogger(__name__)

EXEC_TIMEOUT_S = 30
MAX_PNG_BYTES = 8 * 1024 * 1024
CPU_LIMIT_S = 25

# Запрещённые к импорту модули (доступ к ФС/сети/процессам).
_BLOCKED_IMPORTS = {
    "os", "sys", "subprocess", "shutil", "socket", "requests", "httpx",
    "urllib", "urllib2", "aiohttp", "pathlib", "ctypes", "pickle", "shelve",
    "importlib", "builtins", "pty", "signal", "resource", "multiprocessing",
    "threading", "asyncio", "http", "ftplib", "smtplib", "tempfile", "glob",
    "webbrowser", "platform", "pwd", "grp",
}

# Запрещённые имена-вызовы (escape из песочницы AST-блоклиста).
_BLOCKED_NAMES = {
    "eval", "exec", "compile", "__import__", "open", "input",
    "globals", "locals", "vars", "getattr", "setattr", "delattr",
    "memoryview", "__builtins__", "breakpoint",
}

# Обёртка: Agg-бэкенд, разумные дефолты, сохранение фигуры в stdout как PNG.
# Без отступа в исходнике (textwrap.dedent тут не применим: строка {code}
# в нулевой колонке сделала бы общий отступ нулевым).
_WRAPPER = """import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['figure.dpi'] = 150
plt.rcParams['figure.figsize'] = (8, 5)
plt.rcParams['font.family'] = 'DejaVu Sans'
plt.rcParams['axes.unicode_minus'] = False


def _emit():
    import io as _io
    import sys as _sys
    if not plt.get_fignums():
        return
    _buf = _io.BytesIO()
    plt.savefig(_buf, format='png', bbox_inches='tight')
    _sys.stdout.buffer.write(_buf.getvalue())


try:
{code}
finally:
    _emit()
"""


def _check_ast(code: str) -> str | None:
    """None если код безопасен, иначе текст причины отказа."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"синтаксическая ошибка: {e}"
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name.split(".")[0] in _BLOCKED_IMPORTS:
                    return f"запрещённый импорт: {a.name}"
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").split(".")[0] in _BLOCKED_IMPORTS:
                return f"запрещённый импорт: {node.module}"
        elif isinstance(node, ast.Name) and node.id in _BLOCKED_NAMES:
            return f"запрещённое имя: {node.id}"
        elif isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            return f"запрещённый доступ к атрибуту: {node.attr}"
    return None


def _limits() -> None:  # pragma: no cover — выполняется в подпроцессе
    import resource

    # Лимит CPU-времени и числа процессов. RLIMIT_AS (виртуальная память) НЕ
    # ставим: numpy/matplotlib резервируют гигабайты адресного пространства и
    # падают по SIGKILL; от утечек памяти защищает лимит контейнера и таймаут.
    resource.setrlimit(resource.RLIMIT_CPU, (CPU_LIMIT_S, CPU_LIMIT_S))
    resource.setrlimit(resource.RLIMIT_NPROC, (256, 256))


def run_matplotlib(code: str) -> bytes | None:
    """Выполняет скрипт и возвращает PNG-байты или None при любой ошибке."""
    reason = _check_ast(code)
    if reason:
        log.info("matplotlib script rejected: %s", reason)
        return None
    wrapped = _WRAPPER.format(code=textwrap.indent(code, "    "))
    try:
        result = subprocess.run(
            [sys.executable, "-I", "-c", wrapped],
            capture_output=True,
            timeout=EXEC_TIMEOUT_S,
            preexec_fn=_limits,
            env={
                "HOME": "/tmp",
                "MPLCONFIGDIR": "/tmp/.mpl",
                "PATH": "/usr/local/bin:/usr/bin:/bin",
                "LANG": "C.UTF-8",
            },
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        log.info("matplotlib script failed: %s", e)
        return None
    if result.returncode != 0:
        log.info("matplotlib script exited %s: %s", result.returncode, result.stderr[-300:])
        return None
    png = result.stdout
    if not png or len(png) > MAX_PNG_BYTES or png[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return png


def png_to_data_url(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode()
