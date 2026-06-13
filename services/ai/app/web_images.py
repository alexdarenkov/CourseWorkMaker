"""SSRF-безопасная загрузка картинок по URL, которые предлагает ИИ-агент.

Скачиваем только http(s), блокируем приватные адреса, проверяем content-type
и размер. Возвращаем data-URL для встраивания в отчёт как ассет.
"""

from __future__ import annotations

import base64
import ipaddress
import logging
import socket
from urllib.parse import urlparse

import httpx

log = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 10 * 1024 * 1024
FETCH_TIMEOUT = 10.0
# Многие хосты (в т. ч. Wikimedia) отклоняют «непохожий на браузер» UA.
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

_MAGIC = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)


def _is_private_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return True
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return True
    return False


def _detect_mime(content_type: str, data: bytes) -> str | None:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in ("image/png", "image/jpeg", "image/gif", "image/webp"):
        return ct
    for magic, mime in _MAGIC:
        if data.startswith(magic):
            return mime
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def fetch_image_data_url(url: str) -> str | None:
    """Скачивает картинку и возвращает data-URL или None при любой проблеме."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    if _is_private_host(parsed.hostname):
        log.warning("Blocked image fetch to private host: %s", parsed.hostname)
        return None
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": USER_AGENT})
            resp.raise_for_status()
            data = resp.content
            if not (0 < len(data) <= MAX_IMAGE_BYTES):
                return None
            mime = _detect_mime(resp.headers.get("content-type", ""), data)
            if mime is None:
                return None
            return f"data:{mime};base64," + base64.b64encode(data).decode()
    except Exception:
        log.info("Image fetch failed: %s", url)
        return None
