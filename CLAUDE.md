# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CourseWorkMaker (md2docx) — онлайн-редактор Markdown с живым постраничным превью «как в Word» и серверной конвертацией в DOCX по **ГОСТ 7.32-2017**, плюс ИИ-агент, генерирующий курсовую целиком. Документация и комментарии в коде — на русском. Текст стандарта лежит в корне (`ГОСТ 7.32-2017.pdf`) — при вопросах об оформлении сверяйся с ним, а не с памятью.

## SDD: где лежит истина

Проект ведётся по spec-driven development, процесс — `docs/README.md`. **Меняя поведение — правь спеку в том же изменении**; перед изменением области читай её спеку. При конфликте этого файла со спекой истинна спека.

- `docs/specs/` — поведение (источник истины): `markdown-dialect.md` (диалект, MD-*), `gost-layout.md` (оформление, GL-*), `pagination.md` (переносы страниц, PAG-*), `ai-agent.md` (агент, AI-*), `security.md` (SEC-*)
- `docs/architecture/` — устройство: `overview.md` (монолит, порты, роутеры, ключевые модули фронта), `api.md` (эндпоинты, env), `flows/` (схемы: docx-export, ai-generation, auth)
- `docs/decisions/` — ADR (решения с альтернативами); `docs/audit/` — конспекты изучения кода
- Ритуалы: `/spec-review` (ревью спеки до кода), `/spec-audit` (сверка диффа со спеками перед коммитом), `/adr` (оформить решение)

## Commands

```bash
# Полный запуск (нужен .env с JWT_SECRET; AI_API_KEY — только для ИИ)
docker compose up --build          # фронт: http://localhost:3000, backend: :8000

# Режим разработки: бэкенд в докере, фронт с hot-reload
docker compose up postgres backend
cd frontend && npm install && npm run dev   # http://localhost:5173, vite проксирует /api на :8000

# Сборка/тайпчек фронтенда
cd frontend && npm run build       # tsc -b && vite build

# Тесты фронтенда (vitest + happy-dom + @testing-library) — в frontend/tests/,
# зеркало src/ (tests/lib, tests/components, tests/hooks, tests/pages). Имена содержат ID пунктов спек.
cd frontend && npm run test
# один тест: npm run test -- -t "<название теста>"   # напр. -t "AI-7"

# Тесты бэкенда (монолит; гоняются в docker — локальный python может быть старым,
# а формулам нужен pandoc, который ставится только в образе)
cd services/backend
docker build -t cwm-backend . && docker run --rm -v "$PWD/tests:/srv/tests" cwm-backend python -m pytest tests -q
# один тест: ... python -m pytest tests -q -k <name>   # напр. -k test_gost или -k test_auth
```

Образ бэкенда копирует только `app/` — тесты подмонтированы томом, поэтому правки в `tests/` видны без пересборки, а правки в `app/` требуют `docker build`.

## Архитектура (big picture)

**Бэкенд — один FastAPI-процесс** (`services/backend/Dockerfile`, pandoc из apt). `app/main.py` собирает три роутера: `app/auth` (`/api/auth/*`), `app/convert` (`POST /api/convert/docx`), `app/ai` (`/api/ai/plan|generate|edit|jobs/{id}|analyze-prompt|pricing`). Бывшие Java-сервисы, gateway и отдельные converter/ai удалены (ADR-0004).

- **БД — только таблица `users`.** Серверного CRUD документов нет: документ живёт в localStorage браузера, перенос между устройствами — экспорт/импорт `.zip` (`lib/docExport.ts` / `lib/docImport.ts`). Не добавляй серверное хранение документов без ADR.
- **Задачи ИИ — in-memory** (`app/ai/jobs.py`): рестарт бэкенда теряет их, второй воркер их не увидит. Фронт поллит `GET /api/ai/jobs/{id}` раз в 700 мс и стримит `partial` прямо в редактор (`hooks/useAiJob.ts`); результат применяется к документу СРАЗУ — без diff-просмотра и отката.
- **Конвейер агента** (`app/ai/agent.py`): план → пораздельная генерация → самопроверка «нормоконтролёра» → программный линт структуры → построение иллюстраций. Иллюстрации: matplotlib-скрипты исполняются в песочнице (`matplotlib_exec.py`, AST-блоклист + лимиты подпроцесса), внешние картинки качаются SSRF-безопасно (`web_images.py`).

**Фронтенд — React + Vite**, роуты в `src/App.tsx`: `/` (HomePage), `/editor`, `/create`, `/login`, `/profile`.

- **`EditorPage.tsx` — владелец состояния** (`md`, `settings`); вся механика вынесена в хуки: `usePagination` (дебаунс 180 мс, перезапуск по готовности mermaid/картинок), `useDocPersistence` (localStorage, дебаунс 700 мс), `useAiJob`, `useZoom`, `useToast`.
- **`lib/handoff.ts` — модульный «карман» между страницами.** `File` и запущенную job нельзя надёжно протащить через history state, поэтому HomePage/CreatePage кладут действие в модуль, а EditorPage забирает его при монтировании (одноразово). Роутерный state для этого не использовать.
- **Картинки — через косвенность `asset:img-…`** (`lib/assets.ts`): в markdown только короткая ссылка, data-URL лежит в памяти + localStorage. Не вставляй base64 в текст документа.
- **Ключи localStorage:** `md2docx:v1` (md + settings), `md2docx:assets:v1` (картинки), токен. Токен подставляет `api/client.ts` (`Authorization: Bearer`), пользователь — `auth/AuthContext.tsx`.

## Главные инварианты (детали — в спеках)

1. **Два параллельных рендера ГОСТ.** Превью (`markdown.ts` → `gostRender.ts` → `paginate.ts`) и DOCX (`convert/md_parser.py` → `convert/gost.py`) реализованы дважды и обязаны совпадать вплоть до номеров страниц. Меняя диалект или оформление — правь ОБЕ стороны и тесты обеих сторон (`frontend/tests/lib/gostRender.test.ts` ↔ `services/backend/tests/convert/test_gost_layout.py`). Метрики строк (GL-2) меняются только парой. Фикстура kalman-report существует в двух копиях (`frontend/src/fixtures/` = `services/backend/tests/convert/data/`) — менять только парой. Меняя пагинацию/рендер — прогони все сценарии дев-харнесса (`http://localhost:5173/preview-test.html?doc=toc|code|wide|mixed|report&page=N`, только dev-сервер) и сверь паритет страниц с DOCX бэкенда, открытым в Word/LibreOffice (`docs/specs/pagination.md`, «Верификация»).
2. **Безопасность (SEC-1).** JWT проверяет сам монолит — зависимость `app/security.py:get_current_user_id` (gateway и `X-User-Id` удалены). Каждый НОВЫЙ приватный маршрут обязан требовать `Depends(get_current_user_id)` (на роутере или в хендлере); публичны только /login и /register.
3. **Overlay-подсветка редактора.** `<textarea>` и слой `<pre>` обязаны переносить строки одинаково: в стилях токенов только цвет/фон/border-radius (`docs/architecture/overview.md`, «Frontend: ключевые модули»). Визуальная проверка — дев-харнесс `http://localhost:5173/highlight-test.html`.

## Границы тестов

Юнит-тесты фронта гоняются в happy-dom и **не измеряют реальную раскладку** (`offsetHeight` там не считается) — они проверяют разметку и правила рендера, но не то, где реально ляжет разрыв страницы. Пагинация верифицируется только дев-харнессом в настоящем Chrome + сверкой с DOCX. Тесты бэкенда идут на SQLite (`tests/conftest.py` подменяет `DATABASE_URL` до импорта приложения), Postgres поднимать не нужно.

## Гочи деплоя

`docker compose restart` **не** перечитывает `.env` — нужен `docker compose up -d <service>`; docker-сборка иногда тихо не обновляет образ (кэш) — после деплоя сверяй артефакт в контейнере (backend: grep правки в `app/convert/gost.py`; frontend: имя бандла `index-<hash>.js` в `dist/` vs контейнер).
