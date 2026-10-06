from app.main import app


def test_ai_surface_removed(client):
    # FastAPI хранит include_router лениво; опубликованные пути доступны в OpenAPI.
    assert not any(path.startswith('/api/ai') for path in app.openapi()['paths'])
    assert client.post('/api/ai/generate').status_code == 404
    assert client.get('/api/ai/pricing').status_code == 404
    assert client.get('/health').json() == {'status': 'ok'}


def test_auth_surface_removed(client):
    assert not any(path.startswith('/api/auth') for path in app.openapi()['paths'])
    assert client.post('/api/auth/login', json={}).status_code == 404
    assert client.post('/api/auth/register', json={}).status_code == 404


def test_conversion_is_public(client):
    r = client.post('/api/convert/docx', json={'markdown': 'Текст'})
    assert r.status_code == 200, r.text
    assert r.content[:2] == b'PK'
