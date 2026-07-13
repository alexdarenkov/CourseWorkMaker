"""Тесты извлечения и проверки URL источников."""

import asyncio

import httpx

from app import sources
from app.sources import bibliography_urls, check_bibliography_urls

DOC = """# Введение

Текст со ссылкой в теле https://example.com/in-body — не источник.

# Список использованных источников

1. Иванов И. И. Учебник. — М.: Наука, 2024.
2. Официальный сайт [Электронный ресурс]. — URL: https://example.com/page (дата обращения: 01.06.2026).
3. Повтор. — URL: https://example.com/page.
4. Другой ресурс. — URL: http://a.example.org/doc.pdf;
"""


def test_bibliography_urls_only_from_bib_section():
    urls = bibliography_urls(DOC)
    assert urls == ["https://example.com/page", "http://a.example.org/doc.pdf"]


def test_bibliography_urls_empty_without_bib():
    assert bibliography_urls("# Введение\n\nhttps://example.com") == []


def test_check_reports_broken_and_ok(monkeypatch):
    # Ходить в сеть из тестов нельзя — подменяем транспорт httpx.
    def handler(request: httpx.Request) -> httpx.Response:
        if "a.example.org" in str(request.url):
            return httpx.Response(404)
        return httpx.Response(200)

    real_client = httpx.AsyncClient

    def fake_client(**kw):
        kw["transport"] = httpx.MockTransport(handler)
        return real_client(**kw)

    monkeypatch.setattr(sources.httpx, "AsyncClient", fake_client)
    monkeypatch.setattr(sources, "_is_private_host", lambda host: False)
    issues = asyncio.run(check_bibliography_urls(DOC))
    assert len(issues) == 1
    assert "a.example.org" in issues[0] and "404" in issues[0]


def test_check_blocks_private_hosts(monkeypatch):
    monkeypatch.setattr(sources, "_is_private_host", lambda host: True)
    doc = "# Список использованных источников\n\n1. — URL: http://192.168.0.1/x.\n"
    issues = asyncio.run(check_bibliography_urls(doc))
    assert len(issues) == 1 and "приватную" in issues[0]


def test_check_head_not_supported_is_ok(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(405)

    real_client = httpx.AsyncClient

    def fake_client(**kw):
        kw["transport"] = httpx.MockTransport(handler)
        return real_client(**kw)

    monkeypatch.setattr(sources.httpx, "AsyncClient", fake_client)
    monkeypatch.setattr(sources, "_is_private_host", lambda host: False)
    doc = "# Список использованных источников\n\n1. — URL: https://strict.example.com/a.\n"
    assert asyncio.run(check_bibliography_urls(doc)) == []


def test_check_no_urls_no_network():
    doc = "# Список использованных источников\n\n1. Иванов И. И. Учебник.\n"
    assert asyncio.run(check_bibliography_urls(doc)) == []
