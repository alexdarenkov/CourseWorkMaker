# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CourseWorkMaker (md2docx) — онлайн-редактор Markdown с живым постраничным превью «как в Word» и серверной конвертацией в DOCX по **ГОСТ 7.32-2017**, плюс ИИ-агент (LangChain + Kimi через прокси Polza.ai), генерирующий курсовую целиком. Документация и комментарии в коде — на русском.

## Commands

```bash
# Полный запуск (нужен .env с JWT_SECRET; AI_API_KEY — только для ИИ)
docker compose up --build          # фронт: http://localhost:3000, шлюз: :8080

# Режим разработки: бэкенд в докере, фронт с hot-reload
docker compose up postgres gateway auth-service document-service converter-service ai-service
cd frontend && npm install && npm run dev   # http://localhost:5173, vite проксирует /api на :8080

# Сборка/тайпчек фронтенда
cd frontend && npm run build       # tsc -b && vite build

# Тесты конвертера (единственный тестовый набор в проекте)
cd services/converter
docker build -t cwm-converter . && docker run --rm -v "$PWD/tests:/srv/tests" cwm-converter python -m pytest tests -q
# один тест: ... python -m pytest tests/test_converter.py -q -k <name>
```

Java-сервисы (gateway, auth, document) собираются Gradle'ом внутри своих Dockerfile — локального gradle wrapper нет, пересборка через `docker compose build <service>`.

## Architecture

Микросервисы за единым шлюзом. Браузер → `frontend` (React+TS+Vite+Tailwind, nginx) → `/api` → `gateway` (Spring Cloud Gateway, :8080) → внутренние сервисы:

- `services/auth` — Spring Boot :8081, JWT (HS256, JJWT), BCrypt, Flyway, БД `auth_db`
- `services/document` — Spring Boot :8082, документы пользователя (markdown + настройки), БД `document_db`
- `services/converter` — FastAPI :8001, python-docx + latex2mathml, MD → DOCX по ГОСТ
- `services/ai` — FastAPI :8002, LangChain + OpenAI-совместимый прокси Polza.ai (`AI_API_KEY`/`AI_BASE_URL`; модели скрыты за уровнями качества `AI_MODEL_FAST`/`AI_MODEL_BALANCED`/`AI_MODEL_QUALITY`, формат `provider/model`), асинхронные job'ы с отменой (`/jobs/{id}/cancel`) и ценами (`/pricing`)

### Безопасность (инвариант)

JWT проверяет **только** gateway (`gateway/.../security/JwtAuthFilter.java`); внутрь личность передаётся заголовком `X-User-Id`, а клиентские `X-User-*` всегда вырезаются на шлюзе. Внутренние сервисы доверяют `X-User-Id` без проверки токена. Публичны только `POST /api/auth/login` и `/api/auth/register`. Загрузка картинок в конвертере защищена от SSRF (`converter/app/images.py`: приватные адреса блокируются, лимит 10 МБ).

### Два параллельных рендера ГОСТ (главный инвариант)

Превью и DOCX реализованы **дважды** и должны давать идентичный результат:

- **Фронтенд**: `frontend/src/lib/markdown.ts` (парсер в блочную модель) → `gostRender.ts` (блоки → HTML по ГОСТ: нумерация разделов/рисунков/таблиц/формул, титульник, содержание) → `paginate.ts` (разбивка на страницы А4 измерением реальных высот в скрытом DOM-хосте).
- **Бэкенд**: `services/converter/app/md_parser.py` (парсер, согласован с фронтендовым) → `gost.py` (сборка .docx: поля/шрифты/интервалы по ГОСТ, настоящее TOC-поле Word, OMML-формулы через `omml.py`).

Меняя поддерживаемый Markdown-диалект или правила оформления, правь **обе** стороны. Диалект описан в README («Диалект Markdown»): `#` — раздел с новой страницы и автонумерацией, структурные заголовки (ВВЕДЕНИЕ/ЗАКЛЮЧЕНИЕ/СПИСОК…) — прописными по центру, строки-подписи `Таблица: …` / `Рисунок: …` перед таблицей/картинкой, `$$…$$`/`$…$` — формулы Word (OMML), mermaid рендерится фронтендом в PNG (`mermaidRenderer.ts`) и передаётся конвертеру в `assets`.

### ИИ-агент (`services/ai/app/agent.py`)

Конвейер: план (строгий JSON) → генерация разделов по одному с контекстом плана и загруженных файлов (PDF/DOCX/TXT/MD, `files.py`) → самопроверка «нормоконтролёром» (temperature=0) → программный линт структуры + исправляющий вызов → построение графиков. При `include_images` ИИ пишет скрипты в блоках ` ```matplotlib `, а `figures.py`/`matplotlib_exec.py` выполняют их в изолированном подпроцессе (AST-блоклист, RLIMIT_CPU, таймаут 30с) и встраивают PNG как ассеты `asset:fig-N` (возвращаются в ответе job вместе с markdown — фронт кладёт их в хранилище, конвертер встраивает в DOCX). Polza — чистый прокси моделей (без code-interpreter), поэтому исполнение скриптов только на нашей стороне. Задачи асинхронные: `POST /api/ai/generate` → `jobId`, опрос `GET /api/ai/jobs/{id}` (`jobs.py`); прогресс показывается в UI. Без `AI_API_KEY` сервис возвращает понятную ошибку «не сконфигурирован».
