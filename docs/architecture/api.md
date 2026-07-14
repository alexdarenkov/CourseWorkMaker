# Архитектура: API

Все запросы идут через gateway (`http://localhost:8080`) с заголовком
`Authorization: Bearer <token>`; публичны только login/register (SEC-2).
Правила маршрутизации/переписывания путей — `overview.md`.

## Авторизация (`/api/auth` → auth-service)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/auth/register` | Регистрация → `{token, user}` |
| `POST` | `/api/auth/login` | Вход → `{token, user}` |
| `GET` | `/api/auth/me` | Текущий пользователь |
| `PUT` | `/api/auth/me` | Имя/почта (возвращает новый токен) |
| `PUT` | `/api/auth/me/password` | Смена пароля |

## Документы (`/api/documents` → document-service)

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/documents` | Список документов пользователя |
| `POST` | `/api/documents` | Создать документ |
| `GET` | `/api/documents/{id}` | Получить документ |
| `PUT` | `/api/documents/{id}` | Обновить документ |
| `DELETE` | `/api/documents/{id}` | Удалить документ |

## Конвертация (`/api/convert` → converter-service `/convert`)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/convert/docx` | `{markdown, docName, settings, assets}` → файл .docx |
| `POST` | `/api/convert/pdf` | то же тело → файл .pdf (LibreOffice, содержание заполнено реальными номерами) |
| `POST` | `/api/convert/title-image` | multipart `file` (PDF/DOCX) → `{image}` — PNG первой страницы (GL-10) |

## ИИ (`/api/ai` → ai-service `/`)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/ai/generate` | multipart: `options` (JSON) + `files[]` → `{jobId}` (AI-1..AI-4) |
| `POST` | `/api/ai/edit` | `{instruction, markdown}` → `{jobId}` — правка документа (AI-6) |
| `POST` | `/api/ai/edit-section` | `{instruction, section_title, markdown}` → `{jobId}`; из UI не вызывается |
| `GET` | `/api/ai/jobs/{id}` | Статус/прогресс/результат; `partial` — стриминг (AI-5) |
| `POST` | `/api/ai/jobs/{id}/cancel` | Отмена задачи |
| `GET` | `/api/ai/pricing` | Цены уровней качества (₽ за млн токенов) |
| `POST` | `/api/ai/lint` | `{markdown, check_urls?}` → `{issues}` — нормоконтроль без LLM (AI-8), работает без `AI_API_KEY` |
| `POST` | `/api/ai/validate-prompt` | `{ok, reason}` — проверка промпта правки (AI-9), fail-open |
| `POST` | `/api/ai/analyze-prompt` | Валидация промпта генерации + извлечение темы/требований/target_pages/include_* (AI-9), fail-open |

Служебное: `GET /health` у обоих Python-сервисов (в gateway не маршрутизируется).

## Переменные окружения

| Переменная | Обязательная | Описание |
|------------|-------------|----------|
| `JWT_SECRET` | да | Секрет HS256, ≥32 байта (`openssl rand -base64 48`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | нет | Доступ PostgreSQL |
| `AI_API_KEY` | нет | Ключ Polza.ai; без него работает всё, кроме ИИ |
| `AI_BASE_URL` | нет | OpenAI-совместимый API (`https://polza.ai/api/v1`) |
| `AI_MODEL_FAST` / `AI_MODEL_BALANCED` / `AI_MODEL_QUALITY` | нет | Модели уровней качества, формат `provider/model` |
