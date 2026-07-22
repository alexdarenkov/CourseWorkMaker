"""Аутентификация: регистрация, вход, профиль (маршруты /api/auth/*).

Публичны только /register и /login; остальное требует Bearer-токен."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..security import create_token, get_current_user_id, hash_password, verify_password
from . import schemas
from .models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _auth_response(user: User) -> schemas.AuthResponse:
    return schemas.AuthResponse(
        token=create_token(user.id, user.email, user.name),
        user=schemas.UserResponse.model_validate(user),
    )


def _by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == email.lower()))


def _require_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    return user


@router.post("/register", response_model=schemas.AuthResponse)
def register(req: schemas.RegisterRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    if _by_email(db, email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь с такой почтой уже существует")
    user = User(name=req.name.strip(), email=email, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return _auth_response(user)


@router.post("/login", response_model=schemas.AuthResponse)
def login(req: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = _by_email(db, req.email.strip())
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверная почта или пароль")
    return _auth_response(user)


@router.get("/me", response_model=schemas.UserResponse)
def me(user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    return schemas.UserResponse.model_validate(_require_user(db, user_id))


@router.put("/me", response_model=schemas.AuthResponse)
def update_profile(
    req: schemas.UpdateProfileRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = _require_user(db, user_id)
    new_email = req.email.strip().lower()
    if new_email != user.email.lower() and _by_email(db, new_email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Эта почта уже занята")
    user.name = req.name.strip()
    user.email = new_email
    db.commit()
    db.refresh(user)
    # Почта/имя входят в токен — выпускаем новый.
    return _auth_response(user)


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    req: schemas.ChangePasswordRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = _require_user(db, user_id)
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Текущий пароль указан неверно")
    user.password_hash = hash_password(req.new_password)
    db.commit()
