# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CourseWorkMaker (md2docx) — онлайн-редактор Markdown с живым постраничным превью «как в Word» и серверной конвертацией в DOCX по **ГОСТ 7.32-2017**, плюс ИИ-агент, генерирующий курсовую целиком. Документация и комментарии в коде — на русском. Текст стандарта лежит в корне (`ГОСТ 7.32-2017.pdf`) — при вопросах об оформлении сверяйся с ним, а не с памятью.

## Где лежит истина

**Этот файл** — источник истины по поведению и устройству. Каталог `docs/` (спеки, архитектура, ADR) удалён в коммите `bccf7bc`; ссылок на него в коде и в командах может остаться много, все они мертвы. Читать удалённые спеки, если понадобилось: `git show bccf7bc^:docs/specs/markdown-dialect.md` (или восстановить целиком — `git checkout bccf7bc^ -- docs`).

Побочный эффект: имена тестов несут ID пунктов спек (`MD-2`…`MD-16`, `GL-9`, `PAG-*`, `AI-4`…`AI-12`, `SEC-6`) — как селекторы они работают (`npm run test -- -t "AI-7"`), но словаря этих ID в рабочем дереве больше нет. Слэш-команды `/spec-review`, `/spec-audit`, `/adr` (`.claude/commands/`) написаны под `docs/` и без него не отрабатывают.

По вопросам оформления сверяйся с `ГОСТ 7.32-2017.pdf` в корне, а не с памятью.

## Ветки и выпуск версий

- **`develop` — основная ветка разработки и интеграции.** Все новые фичи и
  исправления начинаются от актуальной `develop`, PR направляются в `develop`.
  Рабочие ветки агента называются `codex/<задача>` (например,
  `codex/remove-ai`, `codex/reliable-storage`, `codex/docx-parity`).
- **`main` — проверенные релизы.** Готовую версию выпускаем из `develop` в
  `main` и отмечаем тегом версии. Отдельную постоянную `develop` для MVP не создаём.
- **Цель первой публичной версии — редактор без ИИ-агента:** надёжное хранение,
  импорт/экспорт и согласованное оформление превью/DOCX. Это направление
  разработки; наличие этого раздела не означает, что ИИ уже удалён из кода.
- **До удаления ИИ сохранить текущие наработки.** Целевые имена архивной ветки
  и тега — `archive/ai-prototype` и `ai-prototype-v1`. Сначала проверить и
  закоммитить относящиеся к снимку изменения: ветка/тег не сохраняют рабочее
  дерево и index. Архив сохранить также на remote и не использовать для
  обычной разработки. Имена здесь — договорённость, а не подтверждение
  существования Git refs.
- Отключение ИИ, исправления сохранения и изменения рендера оформлять
  отдельными PR. Существующие пользовательские изменения не смешивать с ними.
  Для будущего возвращения ИИ создавать ветку от актуальной `develop` и
  переносить нужные компоненты из архива с адаптацией; архив целиком не сливать.
- Перед слиянием выполнять проверки, соответствующие изменению. Для выпуска
  дополнительно проверить реальное сохранение/восстановление документа,
  переносимый экспорт и паритет Chrome ↔ Word/LibreOffice. Непройденные или
  недоступные проверки указывать явно.

## Commands

```bash
# Полный запуск (нужен .env с JWT_SECRET; AI_API_KEY — только для ИИ)
docker compose up --build          # фронт: http://localhost:3000, backend: :8000

# Режим разработки: бэкенд в докере, фронт с hot-reload
docker compose up postgres backend
cd frontend && npm install && npm run dev   # http://localhost:5173, vite проксирует /api на :8000

# Сборка/тайпчек фронтенда (линтера и форматтера в проекте НЕТ — ни eslint, ни ruff/mypy;
# `tsc -b` внутри build — единственная статическая проверка, гоняй её перед коммитом)
cd frontend && npm run build       # tsc -b && vite build

# Тесты фронтенда (vitest + happy-dom + @testing-library) — в frontend/tests/,
# зеркало src/ (tests/lib, tests/components, tests/hooks, tests/pages). Имена содержат ID пунктов спек.
cd frontend && npm run test
# один тест: npm run test -- -t "<название теста>"   # напр. -t "AI-7"
# один файл: npm run test -- tests/lib/paginate.test.ts

# Тесты бэкенда (монолит; гоняются в docker — локальный python может быть старым,
# а формулам нужен pandoc, который ставится только в образе)
cd services/backend
docker build -t cwm-backend . && docker run --rm -v "$PWD/tests:/srv/tests" cwm-backend python -m pytest tests -q
# один тест: ... python -m pytest tests -q -k <name>   # напр. -k test_gost или -k test_auth
```

Образ бэкенда копирует только `app/` — тесты подмонтированы томом, поэтому правки в `tests/` видны без пересборки, а правки в `app/` требуют `docker build`.

Тесты бэкенда не ходят в сеть и не требуют `AI_API_KEY`: `tests/conftest.py` поднимает SQLite до импорта приложения, а тесты ИИ подменяют `app.ai.config.AI_API_KEY` через `monkeypatch` и проверяют детерминированные части конвейера (линт структуры, песочница matplotlib, проверка промпта, ветки «ИИ не сконфигурирован») — саму модель никто не дёргает. Новый тест ИИ пиши так же: без реальных вызовов LLM.

## Архитектура (big picture)

**Бэкенд — один FastAPI-процесс** (`services/backend/Dockerfile`, pandoc из apt). `app/main.py` собирает три роутера: `app/auth` (`/api/auth/*`), `app/convert` (`POST /api/convert/docx`), `app/ai` (`/api/ai/plan|generate|edit|jobs/{id}|jobs/{id}/cancel|analyze-prompt|pricing`). Бывшие Java-сервисы, gateway и отдельные converter/ai удалены (ADR-0004).

- **БД — только таблица `users`.** Серверного CRUD документов нет: документ живёт в localStorage браузера, перенос между устройствами — экспорт/импорт `.zip` (`lib/docExport.ts` / `lib/docImport.ts`). Не добавляй серверное хранение документов без ADR.
- **Задачи ИИ — in-memory** (`app/ai/jobs.py`): рестарт бэкенда теряет их, второй воркер их не увидит. Фронт поллит `GET /api/ai/jobs/{id}` раз в 700 мс и стримит `partial` прямо в редактор (`hooks/useAiJob.ts`); результат применяется к документу СРАЗУ — без diff-просмотра и отката.
- **Конвейер агента** (`app/ai/agent.py`): план → пораздельная генерация → самопроверка «нормоконтролёра» → программный линт структуры → построение иллюстраций. Иллюстрации: matplotlib-скрипты исполняются в песочнице (`matplotlib_exec.py`, AST-блоклист + лимиты подпроцесса), внешние картинки качаются SSRF-безопасно (`web_images.py`).

**Фронтенд — React + Vite**, роуты в `src/App.tsx`: `/` (HomePage), `/editor`, `/create`, `/login`, `/profile`.

- **`EditorPage.tsx` — владелец состояния** (`md`, `settings`); вся механика вынесена в хуки: `usePagination` (дебаунс 180 мс, перезапуск по готовности mermaid/картинок), `useDocPersistence` (localStorage, дебаунс 700 мс), `useAiJob`, `useScrollSync`, `useCaretMarker`, `useZoom`, `useToast`.
- **Синхронная прокрутка и маркер каретки** — отдельная подсистема (~950 строк) поверх пагинации. Общая «валюта» обеих панелей — ДРОБНЫЙ номер строки markdown: `lib/scrollSync.ts` переводит `scrollTop` редактора в строку и строку — в смещение по ленте страниц, `lib/caretMap.ts` + `lib/caretLocate.ts` уточняют позицию до символа внутри блока, чтобы построить Range в отрендеренном превью. Промежуточные точки — линейная интерполяция между якорями (`Anchor` в `paginate.ts`, ставятся по началам блоков). **Правя расстановку якорей в `paginate.ts`, чини и прокрутку** — она разъезжается молча, тестами в happy-dom это не ловится. Арифметика живёт в `lib/`, DOM трогают только хуки; тесты — `tests/lib/scrollSync.test.ts`, `caretMap.test.ts`, `caretLocate.test.ts`.
- **Геометрия ленты превью — только в `lib/pageGeometry.ts`** (размер листа, поля, зазор), высота строки — только `LINE_HEIGHT`/`LINE_HEIGHT_CODE`/`LINE_HEIGHT_SINGLE` в `gostRender.ts`. Их импортируют вёрстка (`PreviewPane`), авто-зум (`useZoom`), прокрутка (`scrollSync`), измеритель (`HOST_CSS` в `paginate.ts`) и дев-харнесс (`PAGE_CSS` в `previewTest.ts`) — константы не копируй, иначе панели молча разъедутся. Исключение, которое надо держать в голове: `PAGE_CONTENT_HEIGHT_PX` (971) в `paginate.ts` задан отдельным числом.
- **`lib/handoff.ts` — модульный «карман» между страницами.** `File` и запущенную job нельзя надёжно протащить через history state, поэтому HomePage/CreatePage кладут действие в модуль, а EditorPage забирает его при монтировании (одноразово). Роутерный state для этого не использовать.
- **Картинки — через косвенность `asset:img-…`** (`lib/assets.ts`): в markdown только короткая ссылка, data-URL лежит в памяти + localStorage. Не вставляй base64 в текст документа.
- **Ключи localStorage:** `md2docx:v1` (md + settings), `md2docx:assets:v1` (картинки), токен. Токен подставляет `api/client.ts` (`Authorization: Bearer`), пользователь — `auth/AuthContext.tsx`.

## Главные инварианты

1. **Два параллельных рендера ГОСТ.** Превью (`markdown.ts` → `gostRender.ts` → `paginate.ts`) и DOCX (`convert/md_parser.py` → `convert/gost.py`) реализованы дважды и обязаны совпадать вплоть до номеров страниц. Меняя диалект или оформление — правь ОБЕ стороны и тесты обеих сторон (`frontend/tests/lib/gostRender.test.ts` ↔ `services/backend/tests/convert/test_gost_layout.py`). Метрики строк (GL-2) меняются только парой. Фикстура kalman-report существует в двух копиях (`frontend/src/fixtures/` = `services/backend/tests/convert/data/`) — менять только парой. Меняя пагинацию/рендер — прогони все сценарии дев-харнесса (`http://localhost:5173/preview-test.html?doc=toc|code|wide|mixed|report&page=N`, только dev-сервер) и сверь паритет страниц с DOCX бэкенда, открытым в Word/LibreOffice: число страниц и номера в содержании обязаны совпасть.
2. **Безопасность (SEC-1).** JWT проверяет сам монолит — зависимость `app/security.py:get_current_user_id` (gateway и `X-User-Id` удалены). Каждый НОВЫЙ приватный маршрут обязан требовать `Depends(get_current_user_id)` (на роутере или в хендлере); публичны только /login и /register.
3. **Overlay-подсветка редактора.** `<textarea>` и слой `<pre>` обязаны переносить строки одинаково: в стилях токенов только цвет/фон/border-radius (`lib/highlight.ts` + `components/EditorPane.tsx`) — любой отступ, шрифт или межбуквенный интервал в токене разъедет слои. Визуальная проверка — дев-харнесс `http://localhost:5173/highlight-test.html`.

## Границы тестов

Юнит-тесты фронта гоняются в happy-dom и **не измеряют реальную раскладку** (`offsetHeight` там не считается) — они проверяют разметку и правила рендера, но не то, где реально ляжет разрыв страницы. Пагинация верифицируется только дев-харнессом в настоящем Chrome + сверкой с DOCX. Тесты бэкенда идут на SQLite (`tests/conftest.py` подменяет `DATABASE_URL` до импорта приложения), Postgres поднимать не нужно.

Дев-харнессы — отдельные vite-страницы, а не роуты приложения: `frontend/preview-test.html` + `src/previewTest.ts` (ленты страниц по сценариям `?doc=…&page=N`) и `frontend/highlight-test.html` + `src/highlightTest.ts` (слои подсветки). Живут только на dev-сервере (`npm run dev`), в прод-сборку не идут.

Когда пишешь тесты фронта, помни про `tests/setup.ts`: в vitest 4 + happy-dom рабочего `localStorage` нет — там подменён общий in-memory Storage (чистится перед каждым тестом), а автоочистка RTL включена вручную через `afterEach(cleanup)`. Тест, ожидающий настоящий Storage или auto-cleanup от globals, поведёт себя не так, как кажется.

## Гочи деплоя

`docker compose restart` **не** перечитывает `.env` — нужен `docker compose up -d <service>`; docker-сборка иногда тихо не обновляет образ (кэш) — после деплоя сверяй артефакт в контейнере (backend: grep правки в `app/convert/gost.py`; frontend: имя бандла `index-<hash>.js` в `dist/` vs контейнер).
