import asyncio
import pytest
from app import limits


def _call(chunks, declared=None):
    response, forwarded = [], []
    queue = iter([{'type': 'http.request', 'body': chunk, 'more_body': i < len(chunks) - 1} for i, chunk in enumerate(chunks)])
    async def receive():
        return next(queue, {'type': 'http.disconnect'})
    async def send(message):
        response.append(message)
    async def downstream(scope, receive, send):
        while True:
            message = await receive()
            forwarded.append(message.get('body', b''))
            if not message.get('more_body'):
                break
        await send({'type': 'http.response.start', 'status': 200, 'headers': []})
    scope = {'type': 'http', 'method': 'POST', 'headers': [] if declared is None else [(b'content-length', declared)]}
    asyncio.run(limits.RequestSizeLimit(downstream)(scope, receive, send))
    return response[0]['status'], b''.join(forwarded)


def test_chunked_limit_before_application(monkeypatch):
    monkeypatch.setattr(limits, 'MAX_BODY_BYTES', 8)
    assert _call([b'12345', b'6789']) == (413, b'')


def test_allowed_chunks_replayed_exactly(monkeypatch):
    monkeypatch.setattr(limits, 'MAX_BODY_BYTES', 8)
    assert _call([b'1234', b'5678']) == (200, b'12345678')


@pytest.mark.parametrize('length,status', [(b'999999999', 413), (b'-1', 400), (b'no', 400)])
def test_declared_length_rejected(length, status):
    assert _call([], length) == (status, b'')
