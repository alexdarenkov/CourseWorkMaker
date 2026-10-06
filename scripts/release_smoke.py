"""Проверка запущенного production HTTP-контура без сторонних зависимостей."""
import io
import json
import sys
import urllib.error
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

base = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000').rstrip('/')


def request(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data,
                                 headers={'Content-Type': 'application/json'} if data else {})
    try:
        response = urllib.request.urlopen(req, timeout=180)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


for path in ('/', '/editor'):
    status, headers, body = request(path)
    assert status == 200 and b'id="root"' in body, (path, status)
    assert headers.get('X-Content-Type-Options') == 'nosniff'
    assert "frame-ancestors 'none'" in headers.get('Content-Security-Policy', '')
    assert 'no-cache' in headers.get('Cache-Control', '')

status, _, body = request('/health')
assert status == 200 and json.loads(body)['status'] == 'ok'
status, _, _ = request('/api/auth/me')
assert status == 404
status, _, _ = request('/assets/does-not-exist.js')
assert status == 404
status, _, _ = request('/api/convert/docx', {'markdown': '\u0000'})
assert status == 422
status, headers, body = request('/api/convert/docx', {
    'markdown': '# Проверка релиза\n\nТекст сохранён.\n\n$$x^2+y^2=z^2$$',
    'docName': 'Проверка релиза',
    'settings': {'titlePage': False, 'toc': False},
})
assert status == 200, (status, body[:300])
assert headers.get_content_type() == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
with zipfile.ZipFile(io.BytesIO(body)) as archive:
    assert archive.testzip() is None
    root = ET.fromstring(archive.read('word/document.xml'))
    text = ''.join(root.itertext())
    assert 'Текст сохранён.' in text
    assert root.find('.//{http://schemas.openxmlformats.org/officeDocument/2006/math}oMath') is not None
print('OK: SPA, headers, health, 404, 422, DOCX ZIP, кириллица и native OMML')
