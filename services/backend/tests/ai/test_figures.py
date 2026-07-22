"""Тесты резолвинга иллюстраций: matplotlib-скрипты и картинки из интернета."""

from app.ai import figures
from app.ai.figures import has_illustrations, resolve_figures

DOC = """# Раздел

Рисунок: Динамика продаж
```matplotlib
plt.plot([1, 2, 3])
```

Текст между иллюстрациями.

Рисунок: Логотип
![Логотип](https://example.com/logo.png)
"""


def test_has_illustrations_respects_flags():
    assert has_illustrations(DOC, run_scripts=True, fetch_web=False)
    assert has_illustrations(DOC, run_scripts=False, fetch_web=True)
    assert not has_illustrations(DOC, run_scripts=False, fetch_web=False)
    assert not has_illustrations("просто текст", run_scripts=True, fetch_web=True)


def test_script_replaced_with_asset_and_caption_from_line_above(monkeypatch):
    monkeypatch.setattr(figures, "run_matplotlib", lambda code: b"png-bytes")
    monkeypatch.setattr(figures, "png_to_data_url", lambda png: "data:image/png;base64,AAA")
    out, assets = resolve_figures(DOC, run_scripts=True, fetch_web=False)
    assert "```matplotlib" not in out
    assert "![Динамика продаж](asset:fig-0)" in out
    assert assets == {"asset:fig-0": "data:image/png;base64,AAA"}
    # Web-картинка не тронута (fetch_web=False).
    assert "https://example.com/logo.png" in out


def test_failed_script_becomes_placeholder(monkeypatch):
    monkeypatch.setattr(figures, "run_matplotlib", lambda code: None)
    out, assets = resolve_figures(DOC, run_scripts=True, fetch_web=False)
    assert "![Динамика продаж](placeholder)" in out
    assert assets == {}


def test_web_image_replaced_with_asset(monkeypatch):
    monkeypatch.setattr(figures, "run_matplotlib", lambda code: b"png")
    monkeypatch.setattr(figures, "png_to_data_url", lambda png: "data:image/png;base64,AAA")
    monkeypatch.setattr(
        figures, "fetch_image_data_url", lambda url: "data:image/png;base64,WEB"
    )
    out, assets = resolve_figures(DOC, run_scripts=True, fetch_web=True)
    assert "![Логотип](asset:fig-1)" in out
    assert assets["asset:fig-1"] == "data:image/png;base64,WEB"


def test_failed_web_image_becomes_placeholder(monkeypatch):
    monkeypatch.setattr(figures, "fetch_image_data_url", lambda url: None)
    out, _ = resolve_figures(DOC, run_scripts=False, fetch_web=True)
    assert "![Логотип](placeholder)" in out


def test_script_without_caption_gets_default(monkeypatch):
    monkeypatch.setattr(figures, "run_matplotlib", lambda code: b"png")
    monkeypatch.setattr(figures, "png_to_data_url", lambda png: "data:url")
    doc = "Текст.\n\n```matplotlib\nplt.plot([1])\n```\n"
    out, _ = resolve_figures(doc, run_scripts=True, fetch_web=False)
    assert "![График](asset:fig-0)" in out
