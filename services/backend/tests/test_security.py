"""Пароли и JWT: совместимость с прежними Java-сервисами (BCrypt, HS256)."""

import uuid

import jwt

from app import config
from app.security import create_token, hash_password, verify_password


def test_password_roundtrip():
    h = hash_password("secret-password")
    assert h != "secret-password"
    assert verify_password("secret-password", h)
    assert not verify_password("wrong-password", h)


def test_password_over_72_bytes_does_not_crash():
    # Spring BCrypt учитывает только первые 72 байта; длинный пароль не падает,
    # и первые 72 символа определяют хеш.
    long_pw = "a" * 100
    h = hash_password(long_pw)
    assert verify_password(long_pw, h)
    assert verify_password("a" * 72, h)


def test_verify_rejects_garbage_hash():
    assert not verify_password("x", "не-bcrypt-хеш")


def test_token_roundtrip_hs256():
    uid = uuid.uuid4()
    token = create_token(uid, "e@x.ru", "Имя Фамилия")
    claims = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
    assert claims["sub"] == str(uid)
    assert claims["email"] == "e@x.ru"
    assert claims["name"] == "Имя Фамилия"
    assert claims["exp"] > claims["iat"]
