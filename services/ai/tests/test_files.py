"""Тесты извлечения текста из загруженных файлов-источников."""

from app import config
from app.files import build_context, extract_text


def test_extract_plain_text():
    assert extract_text("notes.txt", "Привет, мир".encode()) == "Привет, мир"


def test_extract_broken_file_returns_empty():
    assert extract_text("broken.pdf", b"not a pdf at all") == ""


def test_build_context_labels_files():
    ctx = build_context([("a.md", b"alpha"), ("b.md", b"beta")])
    assert "===== Файл: a.md =====" in ctx
    assert "alpha" in ctx and "beta" in ctx


def test_build_context_skips_empty_and_respects_budget(monkeypatch):
    monkeypatch.setattr(config, "MAX_CONTEXT_CHARS", 100)
    big = ("x" * 500).encode()
    ctx = build_context([("big.txt", big), ("empty.txt", b"   ")])
    assert len(ctx) <= 100
    assert "empty.txt" not in ctx
