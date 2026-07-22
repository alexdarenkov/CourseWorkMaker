# Архитектура: API

Все `/api/*` обслуживает монолит `services/backend` (`http://localhost:8000`)
с заголовком `Authorization: Bearer <token>`; публичны только login/register
(SEC-2). Отдельного gateway больше нет — JWT проверяется в самом сервисе (SEC-1).

## Авторизация (`/api/auth`)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/auth/register` | Регистрация → `{token, user}` |
| `POST` | `/api/auth/login` | Вход → `{token, user}` |
| `GET` | `/api/auth/me` | Текущий пользователь |
| `PUT` | `/api/auth/me` | Имя/почта (возвращает новый токен) |
| `PUT` | `/api/auth/me/password` | Смена пароля |

Серверного CRUD документов нет (удалён 2026-07-19): документ живёт в
localStorage браузера, перенос — экспорт/импорт .zip.

## Конвертация (`/api/convert`)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/convert/docx` | `{markdown, docName, settings, assets}` → файл .docx |

## ИИ (`/api/ai`)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/ai/generate` | multipart: `options` (JSON) + `files[]` → `{jobId}` (AI-1..AI-4) |
| `POST` | `/api/ai/edit` | `{instruction, markdown}` → `{jobId}` — правка всего документа, результат применяется сразу (AI-6) |
| `GET` | `/api/ai/jobs/{id}` | Статус/прогресс/результат; `partial` — стриминг (AI-5) |
| `POST` | `/api/ai/jobs/{id}/cancel` | Отмена задачи |
| `GET` | `/api/ai/pricing` | Цены уровней качества (₽ за млн токенов) |
| `POST` | `/api/ai/analyze-prompt` | Валидация промпта генерации + извлечение темы/требований/target_pages/include_* (AI-9), fail-open |

Служебное: `GET /health` (без авторизации) → `{status, aiConfigured}`.

## Переменные окружения

| Переменная | Обязательная | Описание |
|------------|-------------|----------|
| `JWT_SECRET` | да | Секрет HS256, ≥32 байта (`openssl rand -base64 48`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | нет | Доступ и имя единой БД |
| `DATABASE_URL` | нет | Строка SQLAlchemy (`postgresql+psycopg://…`); в compose выводится из `POSTGRES_*` |
| `AI_API_KEY` | нет | Ключ Polza.ai; без него работает всё, кроме ИИ |
| `AI_BASE_URL` | нет | OpenAI-совместимый API (`https://polza.ai/api/v1`) |
| `AI_MODEL_FAST` / `AI_MODEL_BALANCED` / `AI_MODEL_QUALITY` | нет | Модели уровней качества, формат `provider/model` |
