"""Пароли (BCrypt) и JWT (HS256) + FastAPI-зависимость аутентификации.

Заменяет gateway (SEC-1): JWT проверяется прямо здесь, `user_id` отдаётся в
хендлер. Внутреннего заголовка `X-User-Id` больше нет — подделывать нечего.
BCrypt-хеши и HS256-токены совместимы с прежними Java-сервисами (тот же
секрет и алгоритм), поэтому существующие пользователи и токены продолжают
работать.
"""

import time
import uuid

import bcrypt
import jwt
from fastapi import Header, HTTPException, status

from . import config

# BCrypt учитывает только первые 72 байта пароля (как и Spring BCrypt) —
# обрезаем явно, иначе bcrypt 4.x бросает на длинных паролях.
_BCRYPT_MAX = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:_BCRYPT_MAX], bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:_BCRYPT_MAX], password_hash.encode())
    except (ValueError, TypeError):
        return False


def create_token(user_id: uuid.UUID, email: str, name: str) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email,
        "name": name,
        "iat": now,
        "exp": now + config.JWT_TTL_HOURS * 3600,
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


def get_current_user_id(authorization: str | None = Header(default=None)) -> uuid.UUID:
    """Проверяет `Authorization: Bearer <jwt>` и возвращает id пользователя."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется авторизация")
    try:
        claims = jwt.decode(authorization[7:], config.JWT_SECRET, algorithms=["HS256"])
        return uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется авторизация")
