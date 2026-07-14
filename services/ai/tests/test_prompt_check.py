"""Смысловая валидация промпта: разбор вердикта модели (fail-open) и эндпоинт."""

from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.prompt_check import parse_analysis, parse_verdict


# ---------- parse_verdict: чистая логика, без LLM ----------


def test_parse_verdict_ok():
    assert parse_verdict('{"ok": true}') == (True, None)


def test_parse_verdict_fail_with_reason():
    ok, reason = parse_verdict('{"ok": false, "reason": "Это набор букв, а не тема."}')
    assert ok is False
    assert reason == "Это набор букв, а не тема."


def test_parse_verdict_json_wrapped_in_text():
    # Модель иногда оборачивает JSON в текст/markdown — выдираем объект.
    raw = 'Вот ответ:\n```json\n{"ok": false, "reason": "Сформулируйте тему."}\n```'
    ok, reason = parse_verdict(raw)
    assert ok is False and reason == "Сформулируйте тему."


def test_parse_verdict_fail_open_on_garbage():
    # Любой непонятный ответ валидатора НЕ блокирует пользователя.
    for raw in ("", "не знаю", '{"broken": }', '["ok"]', '{"ok": "да"}'):
        assert parse_verdict(raw) == (True, None)


def test_parse_verdict_fail_without_reason_and_long_reason():
    assert parse_verdict('{"ok": false}') == (False, None)
    ok, reason = parse_verdict('{"ok": false, "reason": "' + "х" * 500 + '"}')
    assert ok is False and len(reason) == 300


def test_parse_verdict_ok_ignores_reason():
    # ok=true с reason — причина не нужна.
    assert parse_verdict('{"ok": true, "reason": "всё хорошо"}') == (True, None)


# ---------- parse_analysis: разбор промпта генерации ----------


def test_parse_analysis_full():
    raw = """{"ok": true, "topic": "Фильтр Калмана в навигации",
      "requirements": "минимум 15 источников", "target_pages": 20,
      "include_tables": true, "include_formulas": false, "include_diagrams": null}"""
    a = parse_analysis(raw, "весь промпт")
    assert a["ok"] is True
    assert a["topic"] == "Фильтр Калмана в навигации"
    assert a["requirements"] == "минимум 15 источников"
    assert a["target_pages"] == 20
    assert a["include_tables"] is True
    assert a["include_formulas"] is False
    assert a["include_diagrams"] is None  # не упомянуто — не трогаем


def test_parse_analysis_rejects_with_reason():
    a = parse_analysis('{"ok": false, "reason": "Это не тема."}', "фывафыва")
    assert a["ok"] is False and a["reason"] == "Это не тема."


def test_parse_analysis_fail_open_uses_prompt_as_topic():
    for raw in ("", "мусор", '{"broken"'):
        a = parse_analysis(raw, "Тема из промпта")
        assert a["ok"] is True
        assert a["topic"] == "Тема из промпта"
        assert a["requirements"] == ""
        assert a["include_tables"] is None


def test_parse_analysis_clamps_pages_and_lengths():
    a = parse_analysis('{"ok": true, "topic": "' + "т" * 600 + '", "target_pages": 99}', "x")
    assert len(a["topic"]) == 500
    assert a["target_pages"] == 40
    a2 = parse_analysis('{"ok": true, "topic": "т", "target_pages": 1}', "x")
    assert a2["target_pages"] == 5


def test_analyze_endpoint_without_key_is_fail_open(monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "")
    client = TestClient(app)
    r = client.post("/analyze-prompt", json={"text": "Курсовая про фильтр Калмана, 20 стр."})
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["topic"] == "Курсовая про фильтр Калмана, 20 стр."
    assert d["includeTables"] is None


# ---------- эндпоинт ----------


def test_validate_prompt_without_key_is_fail_open(monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "")
    client = TestClient(app)
    r = client.post("/validate-prompt", json={"kind": "topic", "text": "фывафыва"})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "reason": None}


def test_validate_prompt_rejects_bad_kind(monkeypatch):
    monkeypatch.setattr(config, "AI_API_KEY", "")
    client = TestClient(app)
    r = client.post("/validate-prompt", json={"kind": "chat", "text": "тема"})
    assert r.status_code == 422
