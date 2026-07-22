"""Получение байтов изображений: base64-ассеты от фронтенда или загрузка по URL."""

from __future__ import annotations

import base64
import ipaddress
import logging
import re
import socket
from urllib.parse import urlparse

import httpx

log = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 10 * 1024 * 1024
FETCH_TIMEOUT = 8.0

_DATA_URL = re.compile(r"^data:image/[\w.+-]+;base64,(.*)$", re.DOTALL)


def _decode_base64(value: str) -> bytes | None:
    m = _DATA_URL.match(value.strip())
    payload = m.group(1) if m else value.strip()
    try:
        raw = base64.b64decode(payload, validate=True)
    except Exception:
        return None
    return raw if 0 < len(raw) <= MAX_IMAGE_BYTES else None


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


def _fetch_url(url: str) -> bytes | None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    if _is_private_host(parsed.hostname):
        log.warning("Blocked image fetch to private host: %s", parsed.hostname)
        return None
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()
            if not resp.headers.get("content-type", "").startswith("image/"):
                return None
            data = resp.content
            return data if 0 < len(data) <= MAX_IMAGE_BYTES else None
    except Exception:
        log.warning("Image fetch failed: %s", url)
        return None


class AssetResolver:
    def __init__(self, assets: dict[str, str]):
        self._assets = assets
        self._mermaid_index = 0

    def resolve(self, src: str) -> bytes | None:
        if src in self._assets:
            return _decode_base64(self._assets[src])
        if src.startswith("data:"):
            return _decode_base64(src)
        if src.startswith(("http://", "https://")):
            return _fetch_url(src)
        return None

    def next_mermaid(self) -> bytes | None:
        key = f"mermaid-{self._mermaid_index}"
        self._mermaid_index += 1
        value = self._assets.get(key)
        return _decode_base64(value) if value else None
