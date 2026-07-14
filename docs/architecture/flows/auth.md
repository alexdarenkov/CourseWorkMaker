# Поток: аутентификация и доверие между сервисами

Модель доверия — спека `security.md` (SEC-1/SEC-2). Здесь — как она
работает по шагам.

```mermaid
sequenceDiagram
  actor U as Браузер
  participant G as gateway :8080
  participant A as auth-service :8081
  participant D as document-service :8082

  rect rgb(235, 245, 235)
    Note over U,A: Вход (публичный маршрут)
    U->>G: POST /api/auth/login {email, password}
    G->>A: без JWT-проверки (публичный)
    A->>A: BCrypt-сверка пароля
    A->>A: JJWT: подписать HS256(JWT_SECRET)
    A-->>U: {token, user} → localStorage
  end

  rect rgb(235, 240, 250)
    Note over U,D: Любой защищённый запрос
    U->>G: GET /api/documents<br/>Authorization: Bearer token<br/>(+ возможно поддельный X-User-Id!)
    G->>G: 1. ВЫРЕЗАТЬ все клиентские X-User-*
    G->>G: 2. Проверить подпись и срок JWT
    alt токен невалиден
      G-->>U: 401
    else токен валиден
      G->>G: 3. X-User-Id ← из claims токена
      G->>D: запрос + X-User-Id
      Note over D: Доверяет X-User-Id БЕЗ проверки —<br/>изнутри сети шлюз единственный вход
      D-->>U: документы пользователя
    end
  end
```

## Что важно знать

- Порядок на шлюзе принципиален: сначала вырезать клиентские `X-User-*`,
  потом подставить свой — иначе подделка личности (Gherkin-сценарий в SEC-1).
- Внутренние сервисы НЕ знают `JWT_SECRET` и не проверяют токены — вся
  аутентификация в одной точке (`JwtAuthFilter.java`).
- Следствие: внутренние порты (8001/8002/8081/8082) нельзя публиковать
  наружу — они доверяют заголовку. Наружу открыты только 3000 и 8080.
- Профиль/смена пароля — обычные защищённые маршруты auth-service
  (`/api/auth/me`, `PUT …/password`); смена имени/почты возвращает НОВЫЙ
  токен (claims изменились).
