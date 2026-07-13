"""Тесты песочницы matplotlib: AST-блоклист и реальное выполнение."""

from app.matplotlib_exec import _check_ast, run_matplotlib


# ---------- AST-блоклист ----------

def test_safe_code_passes():
    assert _check_ast("x = [1, 2, 3]\nplt.plot(x)\nplt.title('Ок')") is None


def test_blocked_import():
    assert "os" in _check_ast("import os\nos.remove('x')")


def test_blocked_import_from():
    assert _check_ast("from subprocess import run") is not None


def test_blocked_name_eval():
    assert "eval" in _check_ast("eval('1+1')")


def test_blocked_dunder_attribute():
    assert _check_ast("().__class__.__bases__") is not None


def test_syntax_error_rejected():
    assert "синтакс" in _check_ast("def broken(:")


# ---------- реальное выполнение в подпроцессе ----------

def test_run_matplotlib_produces_png():
    png = run_matplotlib("plt.plot([1, 2, 3], [1, 4, 9])\nplt.title('Тест')")
    assert png is not None
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_run_matplotlib_error_returns_none():
    assert run_matplotlib("raise RuntimeError('boom')") is None


def test_run_matplotlib_no_figure_returns_none():
    assert run_matplotlib("x = 1 + 1") is None
