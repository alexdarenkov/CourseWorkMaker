# Поток: аутентификация

Модель доверия — спека `security.md` (SEC-1/SEC-2). Здесь — как она работает
по шагам. После перехода на монолит вход и проверка токена — в одном сервисе.

```mermaid
sequenceDiagram
  actor U as Браузер
  participant B as backend :8000
  participant P as PostgreSQL

  rect rgb(235, 245, 235)
    Note over U,B: Вход (публичный маршрут)
    U->>B: POST /api/auth/login {email, password}
    B->>P: найти пользователя по email
    B->>B: BCrypt-сверка пароля
    B->>B: PyJWT: подписать HS256(JWT_SECRET), claims sub/email/name
    B-->>U: {token, user} → localStorage
  end

  rect rgb(235, 240, 250)
    Note over U,B: Любой защищённый запрос
    U->>B: POST /api/convert/docx<br/>Authorization: Bearer token
    B->>B: get_current_user_id: проверить подпись и срок JWT
    alt токен невалиден / отсутствует
      B-->>U: 401
    else токен валиден
      B->>B: user_id ← claims.sub (в процессе, не в заголовке)
      B-->>U: результат (файл .docx)
    end
  end
```

## Что важно знать

- Проверка JWT — одна FastAPI-зависимость `get_current_user_id`
  (`app/security.py`); заголовка `X-User-Id` больше нет (SEC-1), подделывать
  личность между сервисами нечем — сервис один.
- Наружу открыт только фронт (`:3000`) — он проксирует `/api` на backend той
  же сети; порт backend (`:8000`) нужен лишь dev-серверу vite и в проде
  закрывается override'ом.
- Профиль/смена пароля — обычные защищённые маршруты (`/api/auth/me`,
  `PUT …/password`); смена имени/почты возвращает НОВЫЙ токен (claims
  изменились).
- Секрет `JWT_SECRET` и алгоритм HS256 те же, что были у Java-сервисов —
  ранее выпущенные токены остаются валидными.
