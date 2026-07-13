# AGENTS.md — CourseWorkMaker (md2docx)

Этот файл предназначен для AI-агентов, работающих с репозиторием. Здесь собраны архитектура, команды, соглашения и инварианты проекта. Документация, комментарии в коде и UI — на русском языке.

---

## 1. Обзор проекта

**CourseWorkMaker** — веб-приложение для написания и оформления курсовых работ по стандарту **ГОСТ 7.32-2017**. Редактор сочетает удобство Markdown с точным постраничным превью «как в Word» и серверной конвертацией в DOCX/PDF.

Ключевые возможности:

- Markdown-редактор с подсветкой синтаксиса, изображениями, таблицами, блоками кода, Mermaid-диаграммами и LaTeX-формулами.
- Живое превью А4 с титульным листом, содержанием, автонумерацией разделов/рисунков/таблиц/формул.
- Экспорт в DOCX с настоящим полем TOC Word, OMML-формулами и нумерацией страниц по ГОСТ.
- Экспорт в PDF через LibreOffice с заполненным содержанием.
- ИИ-генерация курсовой (план → разделы → самопроверка → доводка) через OpenAI-совместимый прокси Polza.ai.
- Облачное хранение документов, авторизация по JWT, нормоконтроль без ИИ.

Текст стандарта лежит в корне репозитория: `ГОСТ 7.32-2017.pdf`.

---

## 2. Технологический стек

| Сервис | Стек | Порт | Назначение |
|--------|------|------|------------|
| `frontend` | React 18, TypeScript 5, Vite 5, Tailwind CSS 3, KaTeX, Mermaid 10, Vitest 4 | `3000` (prod) / `5173` (dev) | SPA-редактор и превью |
| `gateway` | Java 21, Spring Boot 3.4.5, Spring Cloud Gateway 2024.0.1, JJWT 0.12.6 | `8080` | Единая точка входа, JWT-валидация, маршрутизация |
| `auth-service` | Java 21, Spring Boot 3.4.5, Spring Data JPA, Flyway, BCrypt, PostgreSQL driver | `8081` | Регистрация, вход, профиль, выпуск JWT |
| `document-service` | Java 21, Spring Boot 3.4.5, Spring Data JPA, Flyway, PostgreSQL driver | `8082` | CRUD документов пользователя |
| `converter-service` | Python 3.12, FastAPI 0.115, python-docx, Pandoc, LibreOffice, poppler-utils | `8001` | MD → DOCX/PDF по ГОСТ 7.32-2017 |
| `ai-service` | Python 3.12, FastAPI 0.115, LangChain, OpenAI-совместимый API | `8002` | ИИ-генерация, правка разделов, нормоконтроль |
| `postgres` | PostgreSQL 16-alpine | `5432` | Базы `auth_db` и `document_db` |

Сборка и деплой — через **Docker Compose**. Java-сервисы собираются Gradle'ом внутри Dockerfile (локального wrapper нет).

---

## 3. Архитектура

```text
Браузер → frontend (nginx) → /api → gateway → auth-service / document-service / converter-service / ai-service
                                          ↓                         ↓
                                     PostgreSQL               Polza.ai → Kimi/Moonshot
                                     (auth_db / document_db)
```

- Пользователь открывает приложение на `http://localhost:3000`.
- Nginx раздаёт статику фронтенда и проксирует `/api` на шлюз `gateway:8080`.
- Gateway проверяет JWT и маршрутизирует запросы во внутренние сервисы.
- Внутренние сервисы получают идентификатор пользователя через заголовок `X-User-Id`.
- Gateway переписывает пути:
  - `/api/auth/**` → `auth-service`
  - `/api/documents/**` → `document-service`
  - `/api/convert/**` → `/convert/**` в `converter-service`
  - `/api/ai/**` → `/**` в `ai-service`

### Базы данных

- PostgreSQL 16 с двумя базами: `auth_db` (пользователи) и `document_db` (документы).
- Инициализация БД: `infra/postgres/init-databases.sh` монтируется в `/docker-entrypoint-initdb.d/`.
- Миграции схем — Flyway, SQL-файлы в `src/main/resources/db/migration` каждого Java-сервиса.

---

## 4. Структура проекта

```text
CourseWorkMaker/
├── frontend/                    # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/          # UI-компоненты (EditorPane, PreviewPane, Header, StatusBar, модалки)
│   │   ├── lib/                 # Бизнес-логика: markdown.ts, gostRender.ts, paginate.ts, highlight.ts, assets.ts
│   │   ├── pages/               # EditorPage.tsx, AuthPage.tsx
│   │   ├── auth/                # AuthContext.tsx
│   │   ├── api/                 # HTTP-клиент (client.ts, index.ts)
│   │   └── main.tsx / App.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── tailwind.config.js
│   ├── nginx.conf
│   └── Dockerfile
│
├── services/
│   ├── gateway/                 # Spring Cloud Gateway
│   ├── auth/                    # Spring Boot — авторизация
│   ├── document/                # Spring Boot — документы
│   ├── converter/               # Python FastAPI — MD → DOCX/PDF
│   └── ai/                      # Python FastAPI — ИИ-агент
│
├── infra/
│   └── postgres/
│       └── init-databases.sh    # Создание auth_db и document_db
│
├── docker-compose.yml           # Orchestration всех сервисов
├── .env.example                 # Шаблон переменных окружения
├── README.md                    # Пользовательская документация
├── CLAUDE.md                    # Детальные инварианты для Claude Code
└── ГОСТ 7.32-2017.pdf           # Текст стандарта
```

---

## 5. Быстрый старт

### Требования

- Docker 24.0+
- Docker Compose 2.20+
- 4 GB RAM (8 GB для ИИ-генерации)

### Полный запуск

```bash
# 1. Создать файл окружения
cp .env.example .env

# 2. Отредактировать .env (обязательно JWT_SECRET; AI_API_KEY — только для ИИ)
nano .env

# 3. Запустить все сервисы
docker compose up --build

# 4. Открыть приложение
open http://localhost:3000
```

Без `AI_API_KEY` всё работает, кроме ИИ-генерации (сервис вернёт ошибку конфигурации).

### Режим разработки

```bash
# Бэкенд в Docker
docker compose up postgres gateway auth-service document-service converter-service ai-service

# Фронтенд с hot-reload в отдельном терминале
cd frontend
npm install
npm run dev
```

Фронтенд доступен на `http://localhost:5173`, Vite проксирует `/api` на `localhost:8080`.

### Пересборка отдельного сервиса

```bash
docker compose build <service-name>
docker compose up -d <service-name>
```

> Важно: `docker compose restart` **не** перечитывает `.env`. Используй `docker compose up -d <service>`.

---

## 6. Команды сборки и тестирования

### Frontend

```bash
cd frontend
npm install
npm run dev        # dev-сервер http://localhost:5173
npm run build      # tsc -b && vite build → dist/
npm run test       # vitest run (happy-dom)
npm run preview    # vite preview
```

### Java-сервисы

Локального Gradle wrapper нет. Сборка происходит внутри Dockerfile:

```bash
docker compose build gateway          # или auth-service / document-service
docker compose up -d gateway
```

Java unit/интеграционных тестов в репозитории нет.

### Converter service

```bash
cd services/converter

# Локально (требуется Python 3.12 + pandoc + LibreOffice)
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
pytest

# В Docker (рекомендуется)
docker build -t cwm-converter .
docker run --rm -v "$PWD/tests:/srv/tests" cwm-converter python -m pytest tests -q
```

### AI service

```bash
cd services/ai

# Локально
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8002
pytest

# В Docker (рекомендуется)
docker build -t cwm-ai .
docker run --rm -v "$PWD/tests:/srv/tests" cwm-ai python -m pytest tests -q
```

---

## 7. Переменные окружения

Создай `.env` на основе `.env.example`:

| Переменная | Обязательная | Описание | Пример |
|------------|-------------|----------|--------|
| `JWT_SECRET` | ✅ | Секрет подписи JWT (HS256), минимум 32 байта | `openssl rand -base64 48` |
| `POSTGRES_USER` | ❌ | Пользователь PostgreSQL | `coursework` |
| `POSTGRES_PASSWORD` | ❌ | Пароль PostgreSQL | `coursework` |
| `AI_API_KEY` | ❌ | Ключ API Polza.ai | `sk-...` |
| `AI_BASE_URL` | ❌ | Базовый URL OpenAI-совместимого API | `https://polza.ai/api/v1` |
| `AI_MODEL_FAST` | ❌ | Модель «Быстро» | `google/gemini-2.5-flash` |
| `AI_MODEL_BALANCED` | ❌ | Модель «Баланс» | `openai/gpt-5-mini` |
| `AI_MODEL_QUALITY` | ❌ | Модель «Качество» | `anthropic/claude-sonnet-4.6` |

---

## 8. API endpoints

Все запросы (кроме авторизации) идут через Gateway (`http://localhost:8080`) с заголовком `Authorization: Bearer <token>`.

### Авторизация

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/auth/register` | Регистрация |
| `POST` | `/api/auth/login` | Вход |
| `GET` | `/api/auth/me` | Текущий пользователь |
| `PUT` | `/api/auth/me` | Обновление имени/почты |
| `PUT` | `/api/auth/me/password` | Смена пароля |

### Документы

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/documents` | Список документов |
| `POST` | `/api/documents` | Создать документ |
| `GET` | `/api/documents/{id}` | Получить документ |
| `PUT` | `/api/documents/{id}` | Обновить документ |
| `DELETE` | `/api/documents/{id}` | Удалить документ |

### Конвертация

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/convert/docx` | MD → DOCX |
| `POST` | `/api/convert/pdf` | MD → PDF |
| `POST` | `/api/convert/title-image` | PDF/DOCX → PNG (первая страница) |

### ИИ-генерация

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/ai/generate` | Генерация курсовой |
| `POST` | `/api/ai/edit` | Правка всего документа |
| `POST` | `/api/ai/edit-section` | Правка одного раздела |
| `GET` | `/api/ai/jobs/{id}` | Статус и partial-результат |
| `POST` | `/api/ai/jobs/{id}/cancel` | Отмена задачи |
| `GET` | `/api/ai/pricing` | Цены уровней качества |
| `POST` | `/api/ai/lint` | Нормоконтроль без LLM |

---

## 9. Диалект Markdown

| Конструкция | Результат |
|-------------|-----------|
| `# Название` | Раздел «N Название», с новой страницы |
| `# Введение` / `# Заключение` / `# Список использованных источников` | Структурный заголовок прописными по центру |
| `## / ###` | Подраздел N.M / пункт N.M.K |
| `Таблица: Название` + GFM-таблица | «Таблица N — Название» + таблица |
| `Рисунок: Название` + ````mermaid```` / `![…](url)` | Иллюстрация + «Рисунок N — Название» |
| `$$…$$`, `$…$` | Формула Word (OMML) с номером `(N)` |
| ` ```python ` ` | Листинг в рамке, Courier New 12 пт |
| `1. / -` | Перечисления `1)` / `–` |
| `---` / `***` | Принудительный разрыв страницы |

Изображения:

- С устройства: хранятся в `localStorage` как `asset:<key>`.
- Из интернета: `![alt](https://...)` — конвертер скачает при экспорте.
- Mermaid: фронтенд рендерит в PNG, конвертер встраивает в DOCX.

---

## 10. Ключевые инварианты и соглашения

### Безопасность (инвариант)

- JWT проверяет **только** `gateway` (`JwtAuthFilter`).
- Внутренние сервисы получают личность через заголовок `X-User-Id` и доверяют ему без повторной проверки токена.
- Клиентские заголовки `X-User-Id`, `X-User-Email`, `X-User-Name` всегда вырезаются на шлюзе.
- Публичные маршруты: только `POST /api/auth/login` и `POST /api/auth/register`.
- Пароли хешируются BCrypt.
- SSRF-защита: загрузка изображений по URL блокирует приватные адреса, лимит 10 МБ (converter и ai).
- Песочница matplotlib: AST-блоклист опасных имён/импортов, `RLIMIT_CPU`, `RLIMIT_NPROC`, таймаут 30 с, изолированный Python-процесс.

### Два параллельных рендера ГОСТ (главный инвариант)

Превью и DOCX реализованы **дважды** и должны давать идентичный результат:

- **Фронтенд**: `frontend/src/lib/markdown.ts` → `gostRender.ts` → `paginate.ts`.
- **Бэкенд**: `services/converter/app/md_parser.py` → `gost.py`.

Меняя поддерживаемый Markdown-диалект или правила оформления, правь **обе** стороны и сверяй метрики (`LINE_HEIGHT`, `LINE_PT` и др.) между `gostRender.ts` и `gost.py`.

### Редактор с overlay-подсветкой

Редактор — `<textarea>` + слой `<pre>` с подсветкой (`frontend/src/lib/highlight.ts`). В стилях подсветки допустимы только цвет/фон/border-radius; любые `padding`/`margin`/`font-size`/`font-family` в токенах разъедут слои с текстом.

### Титульный лист

- Свободные многострочные блоки в `Settings` покрывают курсовую по ГОСТ и отчёты по лабораторным.
- Логотип вуза — ассет вне markdown, передаётся конвертеру отдельно.
- Свой титульник файлом: загруженный PDF/DOCX рендерится в PNG, хранится в `settings.titleCustom`; DOCX вставляет его секцией с нулевыми полями.

### Asset-ссылки

Изображения в markdown хранятся как `asset:<key>`; data-URL — отдельно в `localStorage`, чтобы не раздувать текст.

### ИИ-агент

- Конвейер: план (JSON) → генерация разделов по одному → самопроверка → программный линт → финальная доводка.
- Задачи асинхронные: `POST /api/ai/generate` → `jobId`, опрос `GET /api/ai/jobs/{id}`.
- `partial` job'а — готовые разделы по мере генерации (живой предпросмотр).
- Графики: ИИ пишет скрипты в блоках ` ```matplotlib `, которые выполняются в песочнице.
- Правки ИИ применяются через diff-просмотр; есть rollback-снапшот.

---

## 11. Тестирование

### Frontend

- Vitest 4 + happy-dom.
- Тесты рендера/метрик: `frontend/src/lib/gostRender.test.ts`.
- Запуск: `npm run test`.

### Converter service

- pytest.
- `tests/test_converter.py` — парсер, DOCX smoke, нумерация, inline-форматирование, титульник, таблицы, PDF.
- `tests/test_gost_layout.py` — проверки вёрстки по ГОСТ 7.32-2017.
- Тестовые данные: `tests/data/kalman-report.md`.
- Рекомендуется запускать в Docker (см. раздел 6).

### AI service

- pytest.
- `tests/test_agent.py` — чистая логика агента без вызовов LLM.
- `tests/test_figures.py`, `test_files.py`, `test_sandbox.py`, `test_service.py`, `test_sources.py`.
- Рекомендуется запускать в Docker (см. раздел 6).

### Java-сервисы

- В репозитории нет Java-тестов.
- Health check: `/actuator/health` в каждом сервисе.

### Ручная проверка превью

- `frontend/preview-test.html` — dev-страница для проверки пагинации (`?doc=toc|code|wide|mixed&page=N`).
- `frontend/highlight-test.html` — проверка overlay-подсветки.

---

## 12. Стиль кода и разработки

### Общие принципы

- Делай минимальные изменения, достаточные для задачи.
- Следуй существующему стилю файла, который редактируешь.
- Комментарии и сообщения об ошибках — на русском языке.
- Не меняй существующую логику в тестах; исправляй только ошибки, вызванные изменениями интерфейса.

### TypeScript / React

- Строгий TypeScript (`tsconfig.json`).
- Функциональные компоненты, хуки.
- Tailwind CSS для стилей; кастомные CSS-переменные в `index.css`.
- Светлая/тёмная тема через класс `.dark` (`darkMode: 'class'`).

### Java

- Java 21, records, современные API.
- Пакеты: `com.courseworkmaker.<service>.*`.
- Слои: `controller` → `service` → `repo` → `entity`; DTO в `dto`, исключения в `exception`.
- DTO — Java records с Jakarta Validation.
- UUID первичные ключи, `OffsetDateTime` для временных меток.
- Валидация возвращает `422` с русскими сообщениями.
- `@Transactional` на методах записи.

### Python

- Python 3.12.
- FastAPI + Pydantic 2.
- camelCase алиасы в Pydantic-моделях для совместимости с фронтендом.
- Таймауты и лимиты размеров встроены в ручки.
- Внешние процессы (pandoc, LibreOffice) вызываются с таймаутами.

---

## 13. Деплой и эксплуатация

- Все сервисы оркестрируются `docker-compose.yml`.
- Кастомные настройки compose можно положить в `docker-compose.override.yml` (в `.gitignore`).
- Health checks настроены для всех сервисей; `depends_on` с `condition: service_healthy` задаёт порядок запуска.
- Внешние порты: `3000` (frontend), `8080` (gateway).
- Перед обновлением убедись, что Docker не использует устаревший кэш: проверь артефакт внутри контейнера (например, `grep` правки в `app/gost.py` для converter или имя бандла в `frontend/dist/`).

---

## 14. Полезные ссылки внутри репозитория

- `README.md` — пользовательская документация, функции, API.
- `CLAUDE.md` — детальные инварианты рендера ГОСТ и ИИ-агента.
- `ГОСТ 7.32-2017.pdf` — официальный текст стандарта.
