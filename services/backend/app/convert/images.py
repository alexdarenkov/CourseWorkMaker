"""Получение байтов изображений: base64-ассеты от фронтенда или загрузка по URL."""

from __future__ import annotations

import base64
import ipaddress
import logging
import re
import socket
import time

import httpx

log = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 10 * 1024 * 1024
FETCH_TIMEOUT = 8.0

_DATA_URL = re.compile(r"^data:image/[\w.+-]+;base64,(.*)$", re.DOTALL)


def _decode_base64(value: str) -> bytes | None:
    m = _DATA_URL.match(value.strip())
    payload = m.group(1) if m else value.strip()
    if len(payload) > 4 * ((MAX_IMAGE_BYTES + 2) // 3):
        return None
    try:
        raw = base64.b64decode(payload, validate=True)
    except Exception:
        return None
    return raw if 0 < len(raw) <= MAX_IMAGE_BYTES else None


def _public_address(host: str, port: int) -> str | None:
    """Возвращает проверенный IP; соединение использует его без повторного DNS."""
    try:
        addresses = [ipaddress.ip_address(info[4][0]) for info in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)]
    except (OSError, ValueError):
        return None
    if not addresses or any(not ip.is_global or ip.is_multicast for ip in addresses):
        return None
    return str(addresses[0])


def _fetch_url(url: str) -> bytes | None:
    try:
        target = httpx.URL(url)
        if target.scheme not in ("http", "https") or not target.host or target.username or target.password:
            return None
        port = target.port or (443 if target.scheme == "https" else 80)
        if port not in (80, 443):
            return None
        ip = _public_address(target.host, port)
        if ip is None:
            return None
        # URL содержит числовой IP, а Host/SNI — исходный домен: сертификат
        # проверяется для домена. Proxy из окружения и redirect запрещены.
        pinned = target.copy_with(host=ip)
        deadline = time.monotonic() + FETCH_TIMEOUT
        with httpx.Client(timeout=FETCH_TIMEOUT, follow_redirects=False, trust_env=False) as client:
            with client.stream("GET", pinned, headers={"Host": target.netloc.decode("ascii"), "Accept-Encoding": "identity"}, extensions={"sni_hostname": target.host}) as resp:
                if resp.status_code != 200 or not resp.headers.get("content-type", "").lower().startswith("image/"):
                    return None
                if resp.headers.get("content-encoding", "identity").lower() != "identity":
                    return None
                length = resp.headers.get("content-length")
                if length and (not length.isdigit() or int(length) > MAX_IMAGE_BYTES):
                    return None
                data = bytearray()
                for chunk in resp.iter_bytes(chunk_size=64 * 1024):
                    if len(data) + len(chunk) > MAX_IMAGE_BYTES or time.monotonic() > deadline:
                        return None
                    data.extend(chunk)
                return bytes(data) if data else None
    except Exception:
        log.info("Не удалось загрузить внешнее изображение")
        return None


class AssetResolver:
    def __init__(self, assets: dict[str, str]):
        self._assets = assets
        self._mermaid_index = 0
        self._remote: dict[str, bytes | None] = {}

    def resolve(self, src: str) -> bytes | None:
        if src in self._assets:
            return _decode_base64(self._assets[src])
        if src.startswith("data:"):
            return _decode_base64(src)
        if src.startswith(("http://", "https://")):
            if src not in self._remote:
                if len(self._remote) >= 16:
                    return None
                self._remote[src] = _fetch_url(src)
            return self._remote[src]
        return None

    def next_mermaid(self) -> bytes | None:
        key = f"mermaid-{self._mermaid_index}"
        self._mermaid_index += 1
        value = self._assets.get(key)
        return _decode_base64(value) if value else None
