# Архитектура: обзор

Как система устроена (as-is). Что система должна делать — в `../specs/`,
почему так решили — в `../decisions/`. Ключевые сценарии по шагам — в `flows/`.

## Карта системы

```mermaid
flowchart LR
  U[Браузер] --> F[frontend<br/>React + TS + Vite + Tailwind<br/>nginx :3000]
  F -->|/api| G[gateway<br/>Spring Cloud Gateway :8080<br/>JWT-проверка, X-User-Id]
  G --> A[auth-service<br/>Spring Boot :8081]
  G --> D[document-service<br/>Spring Boot :8082]
  G --> C[converter-service<br/>FastAPI :8001<br/>python-docx, Pandoc]
  G --> AI[ai-service<br/>FastAPI :8002<br/>LangChain]
  A --> P[(PostgreSQL<br/>auth_db)]
  D --> P2[(PostgreSQL<br/>document_db)]
  AI -->|OpenAI-совместимый API| K[Polza.ai<br/>прокси моделей]
```

## Сервисы

| Сервис | Стек | Порт | Назначение |
|--------|------|------|------------|
| `frontend` | React 18, TypeScript 5, Vite 5, Tailwind 3, KaTeX, Mermaid 10, Vitest 4 | 3000 (prod) / 5173 (dev) | SPA: редактор, ГОСТ-превью, консоль ИИ |
| `gateway` | Java 21, Spring Boot 3.4.5, Spring Cloud Gateway 2024.0.1, JJWT 0.12.6 | 8080 | Единая точка входа, JWT-валидация, `X-User-Id` (SEC-1) |
| `auth-service` | Java 21, Spring Boot, JPA, Flyway, BCrypt | 8081 | Регистрация, вход, профиль, выпуск JWT |
| `document-service` | Java 21, Spring Boot, JPA, Flyway | 8082 | CRUD документов (markdown + настройки) |
| `converter-service` | Python 3.12, FastAPI, python-docx, Pandoc | 8001 | MD → DOCX по ГОСТ; формулы LaTeX→OMML через Pandoc (`omml.py`) |
| `ai-service` | Python 3.12, FastAPI, LangChain | 8002 | Генерация и правка курсовой (спека `ai-agent.md`) |
| `postgres` | PostgreSQL 16-alpine | 5432 | Базы `auth_db`, `document_db` |

Java-сервисы собираются Gradle'ом внутри Dockerfile (локального wrapper нет);
Java-тестов в репозитории нет, health — `/actuator/health`.

## Маршрутизация gateway

Источник: `services/gateway/src/main/resources/application.yml`.

| Префикс | Сервис | Переписывание пути |
|---------|--------|--------------------|
| `/api/auth/**` | auth-service | нет (путь как есть) |
| `/api/documents/**` | document-service | нет (путь как есть) |
| `/api/convert/**` | converter-service | `/api/convert/X` → `/convert/X` |
| `/api/ai/**` | ai-service | `/api/ai/X` → `/X` |

Ответный таймаут — **120 с** (потому генерация ИИ — асинхронные job, AI-4).
CORS разрешён для `localhost:3000` и `localhost:5173`; наружу отдаётся
заголовок `Content-Disposition` (имена скачиваемых файлов).

## Данные

- PostgreSQL 16, две базы: `auth_db` (пользователи), `document_db`
  (документы: markdown + настройки JSON).
- Инициализация: `infra/postgres/init-databases.sh` →
  `/docker-entrypoint-initdb.d/`.
- Миграции — Flyway, SQL в `src/main/resources/db/migration` Java-сервисов.
- На клиенте: localStorage — текущий текст, ассеты картинок
  (`asset:<key>`, data-URL отдельно от текста), настройки, JWT.

## Frontend: ключевые модули

- `src/lib/markdown.ts` — парсер MD в блочную модель (зеркало —
  `converter/app/md_parser.py`).
- `src/lib/gostRender.ts` — блоки → HTML по ГОСТ (спека `gost-layout.md`).
- `src/lib/paginate.ts` — разбиение на страницы А4 (спека `pagination.md`).
- `src/lib/highlight.ts` — overlay-подсветка редактора: `<textarea>` + слой
  `<pre>`, которые ОБЯЗАНЫ переносить строки одинаково; в стилях токенов
  допустимы ТОЛЬКО цвет/фон/border-radius — любые
  padding/margin/font-size/font-family разъезжают курсор с текстом
  (симптомы: «плывут интервалы», «правлю одну строку — меняется другая»).
  Касается и подсветки кода в ```-блоках (`hlCode`: токены собираются по
  сырой строке одним проходом с отбросом пересечений). Визуальная проверка —
  `frontend/highlight-test.html`, обе темы.
- `src/pages/EditorPage.tsx` — композиция состояния редактора: документ,
  панели, модалки; вся многошаговая логика вынесена в хуки и lib-модули ниже.
- `src/hooks/` — логика EditorPage по зонам ответственности:
  `usePagination` (дебаунс перепагинации 180 мс), `useDocPersistence`
  (localStorage + облачное автосохранение, `docIdRef`, гонка «правки vs
  поздняя загрузка из облака»), `useAiJob` (поллинг job 700 мс, стриминг
  partial — AI-5, результат генерации/правки применяется в редактор сразу —
  AI-6), `useToast`, `useZoom`.
- `src/lib/aiPrompt.ts` — применение разбора analyze-prompt к настройкам
  отчёта и сборка опций генерации (AI-9; сама `validatePrompt` — в
  `AiConsole.tsx`).
- `src/lib/docImport.ts` / `src/lib/docExport.ts` — чистая логика загрузки
  .md/.zip (кириллица в именах архива, перепривязка локальных картинок к
  asset-ключам) и экспорта .zip/.md (обратно импортируемый архив).
- `src/components/AiConsole.tsx` — консоль ИИ (спека `ai-agent.md`).
- `src/components/ui.tsx` — примитивы, в т.ч. `ModalShell` — единый каркас
  всех модалок (оверлей + панель).

Тесты фронтенда — vitest + happy-dom + @testing-library/react, лежат в
`frontend/tests/` зеркальной структурой к `src/` (`tests/lib/`,
`tests/components/`, `tests/hooks/`); общий setup — `tests/setup.ts`
(in-memory localStorage: штатного в vitest 4 + happy-dom нет). Имена тестов
содержат ID пунктов спек. Реальную раскладку страниц happy-dom не считает —
её проверяет харнесс `preview-test.html` в Chrome (см.
`docs/specs/pagination.md`).

Конвертация в DOCX — СЕРВЕРНАЯ. Client-side генерация на TS (`docx`-либа)
была опробована и отвергнута: низкое качество формул (KaTeX MathML→mml2omml);
Pandoc даёт родной OMML.

## Деплой

- Оркестрация — `docker-compose.yml`; локальные переопределения —
  `docker-compose.override.yml` (в .gitignore).
- Health checks у всех сервисов; `depends_on: service_healthy` задаёт порядок.
- Наружу открыты только 3000 (frontend) и 8080 (gateway).
- **Гочи**: `docker compose restart` НЕ перечитывает `.env` — нужен
  `docker compose up -d <service>`; docker-сборка иногда тихо не обновляет
  образ (кэш) — после деплоя сверять артефакт в контейнере (converter:
  grep правки в `app/gost.py`; frontend: имя бандла `index-<hash>.js`
  в `dist/` против контейнера).
