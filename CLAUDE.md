# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CourseWorkMaker (md2docx) — онлайн-редактор Markdown с живым постраничным превью «как в Word» и серверной конвертацией в DOCX по **ГОСТ 7.32-2017**, плюс ИИ-агент, генерирующий курсовую целиком. Документация и комментарии в коде — на русском. Текст стандарта лежит в корне (`ГОСТ 7.32-2017.pdf`) — при вопросах об оформлении сверяйся с ним, а не с памятью.

## SDD: где лежит истина

Проект ведётся по spec-driven development, процесс — `docs/README.md`. **Меняя поведение — правь спеку в том же изменении**; перед изменением области читай её спеку. При конфликте этого файла со спекой истинна спека.

- `docs/specs/` — поведение (источник истины): `markdown-dialect.md` (диалект, MD-*), `gost-layout.md` (оформление, GL-*), `pagination.md` (переносы страниц, PAG-*), `ai-agent.md` (агент, AI-*), `security.md` (SEC-*)
- `docs/architecture/` — устройство: `overview.md` (сервисы, порты, маршруты gateway, ключевые модули фронта), `api.md` (эндпоинты, env), `flows/` (схемы: docx-export, ai-generation, auth)
- `docs/decisions/` — ADR (решения с альтернативами); `docs/audit/` — конспекты изучения кода
- Ритуалы: `/spec-review` (ревью спеки до кода), `/spec-audit` (сверка диффа со спеками перед коммитом), `/adr` (оформить решение)

## Commands

```bash
# Полный запуск (нужен .env с JWT_SECRET; AI_API_KEY — только для ИИ)
docker compose up --build          # фронт: http://localhost:3000, шлюз: :8080

# Режим разработки: бэкенд в докере, фронт с hot-reload
docker compose up postgres gateway auth-service document-service converter-service ai-service
cd frontend && npm install && npm run dev   # http://localhost:5173, vite проксирует /api на :8080

# Сборка/тайпчек фронтенда
cd frontend && npm run build       # tsc -b && vite build

# Тесты фронтенда (vitest + happy-dom + @testing-library) — в frontend/tests/,
# зеркало src/ (tests/lib, tests/components, tests/hooks). Имена содержат ID пунктов спек.
cd frontend && npm run test
# один тест: npm run test -- -t "<название теста>"   # напр. -t "AI-7"

# Тесты Python-сервисов (гоняются в docker — локальный python может быть старым)
cd services/converter   # или services/ai (тег образа: cwm-ai)
docker build -t cwm-converter . && docker run --rm -v "$PWD/tests:/srv/tests" cwm-converter python -m pytest tests -q
# один тест: ... python -m pytest tests -q -k <name>
```

Java-сервисы (gateway, auth, document) собираются Gradle'ом внутри своих Dockerfile — локального gradle wrapper нет, пересборка через `docker compose build <service>`.

Гочи деплоя: `docker compose restart` **не** перечитывает `.env` — нужен `docker compose up -d <service>`; docker-сборка иногда тихо не обновляет образ (кэш) — после деплоя сверяй артефакт в контейнере (converter: grep правки в `app/gost.py`; frontend: имя бандла `index-<hash>.js` в `dist/` vs контейнер).

## Главные инварианты (детали — в спеках)

1. **Два параллельных рендера ГОСТ.** Превью (`markdown.ts` → `gostRender.ts` → `paginate.ts`) и DOCX (`md_parser.py` → `gost.py`) реализованы дважды и обязаны совпадать вплоть до номеров страниц. Меняя диалект или оформление — правь ОБЕ стороны и тесты обеих сторон (`frontend/tests/lib/gostRender.test.ts` ↔ `services/converter/tests/test_gost_layout.py`). Метрики строк (GL-2) меняются только парой. Фикстура kalman-report существует в двух копиях (`frontend/src/fixtures/` = `services/converter/tests/data/`) — менять только парой. Меняя пагинацию/рендер — прогони все сценарии дев-харнесса `preview-test.html` и сверь паритет страниц с DOCX конвертера, открытым в Word/LibreOffice (`docs/specs/pagination.md`, «Верификация»).
2. **Безопасность (SEC-1).** JWT проверяет только gateway; внутрь идёт `X-User-Id`, клиентские `X-User-*` всегда вырезаются на шлюзе; каждый новый маршрут gateway обязан это соблюдать.
3. **Overlay-подсветка редактора.** `<textarea>` и слой `<pre>` обязаны переносить строки одинаково: в стилях токенов только цвет/фон/border-radius (`docs/architecture/overview.md`, «Frontend: ключевые модули»).
