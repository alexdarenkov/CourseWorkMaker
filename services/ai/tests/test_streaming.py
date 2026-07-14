"""Стриминг генерации раздела (_write_section + on_chunk).

LLM подменяется фейком: проверяем, что on_chunk получает НАКОПЛЕННЫЙ текст
(растущий префикс итога), а при сломанном стриминге срабатывает фолбэк на
обычный ainvoke.
"""

import asyncio

from app.agent import CourseworkAgent, GenerationOptions, Outline, OutlineSection

OPTS = GenerationOptions(topic="Тестовая тема работы")
OUTLINE = Outline(sections=[OutlineSection(title="Введение")])
SECTION = OUTLINE.sections[0]


class _Chunk:
    def __init__(self, content: str) -> None:
        self.content = content


class FakeStreamLLM:
    """Отдаёт ответ кусочками; ainvoke не должен вызываться при живом стриме."""

    def __init__(self, parts: list[str]) -> None:
        self.parts = parts

    async def astream(self, messages):
        for p in self.parts:
            yield _Chunk(p)

    async def ainvoke(self, messages):
        raise AssertionError("ainvoke не должен вызываться при успешном стриминге")


class FakeBrokenStreamLLM:
    """Стриминг недоступен (прокси/модель без stream) — ждём фолбэк."""

    async def astream(self, messages):
        raise RuntimeError("streaming not supported")
        yield  # pragma: no cover — делает функцию генератором

    async def ainvoke(self, messages):
        return _Chunk("# Введение\n\nТекст из фолбэка.")


def _agent(llm) -> CourseworkAgent:
    a = CourseworkAgent.__new__(CourseworkAgent)
    a.llm = llm
    return a


def test_write_section_streams_accumulated_text():
    agent = _agent(FakeStreamLLM(["# Вв", "едение\n\nПервый ", "абзац."]))
    seen: list[str] = []

    async def on_chunk(acc: str) -> None:
        seen.append(acc)

    out = asyncio.run(agent._write_section(OPTS, "", OUTLINE, SECTION, "", on_chunk))
    assert out == "# Введение\n\nПервый абзац."
    # Каждый вызов — накопленный текст: растущие префиксы итогового ответа.
    assert seen == ["# Вв", "# Введение\n\nПервый ", "# Введение\n\nПервый абзац."]
    for got in seen:
        assert out.startswith(got)


def test_write_section_falls_back_when_stream_breaks():
    agent = _agent(FakeBrokenStreamLLM())

    async def on_chunk(acc: str) -> None:  # noqa: ARG001 — не должен успеть
        pass

    out = asyncio.run(agent._write_section(OPTS, "", OUTLINE, SECTION, "", on_chunk))
    assert out == "# Введение\n\nТекст из фолбэка."


def test_write_section_without_callback_uses_plain_invoke():
    # Без on_chunk (самопроверка, правки) — обычный вызов, стрим не трогается.
    class PlainLLM:
        async def ainvoke(self, messages):
            return _Chunk("# Введение\n\nОбычный ответ.")

    agent = _agent(PlainLLM())
    out = asyncio.run(agent._write_section(OPTS, "", OUTLINE, SECTION, ""))
    assert out == "# Введение\n\nОбычный ответ."
