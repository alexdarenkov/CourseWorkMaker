# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CourseWorkMaker (md2docx) — online Markdown editor with a live, paginated
"Word-like" preview and server-side conversion to DOCX formatted per
**ГОСТ 7.32-2017**. The MVP ships **without AI generation**; a previous
AI-agent prototype was stripped out (see "Branches" below). Docs, code
comments, error messages, and UI copy are in Russian — keep new ones in
Russian too.

## Where the source of truth lives

Behavior contracts live in **`docs/README.md`** and `docs/specs/` (dialect:
`markdown-dialect.md`, formatting: `formatting.md`, pagination:
`pagination.md`, document lifecycle: `product.md`, UI: `ui-ux.md`, API:
`api.md`; test-to-spec mapping: `verification.md`). Architecture lives in
`docs/architecture/`, rationale for significant choices in `docs/decisions/`
(ADRs). `AGENTS.md` holds only commands and dev invariants — read it too.
`docs/reference/formatting-rules.md` reconciles the GOST standard, the
university methodology, and current code behavior where they diverge.

When changing behavior: update the relevant spec, code, and tests together.
Update `AGENTS.md` in the same change if it changes an invariant or
architecture point documented there. A spec rule is only binding once its
status is "принят" (accepted); "предложен" (proposed) rules are not enforced
yet — don't infer a rule from code alone.

## Commands

```bash
# Full stack
docker compose up --build          # frontend: http://localhost:3000, backend: :8000

# Dev mode: backend in Docker, frontend with hot reload
docker compose up backend
cd frontend && npm install && npm run dev   # http://localhost:5173, vite proxies /api to :8000

# Frontend build/typecheck (no linter/formatter in the project — no eslint,
# no ruff/mypy; `tsc -b` inside build is the only static check, run it before committing)
cd frontend && npm run build       # tsc -b && vite build

# Frontend tests (vitest + happy-dom + @testing-library), in frontend/tests/,
# mirroring src/ (tests/lib, tests/components, tests/hooks, tests/pages)
cd frontend && npm run test
# single test:  npm run test -- -t "<test name>"        # e.g. -t "GL-9"
# single file:  npm run test -- tests/lib/paginate.test.ts

# Backend tests (monolith; run in Docker — local python may be stale, and
# formula conversion needs pandoc, which is only installed in the image)
cd services/backend
docker build -t cwm-backend . && docker run --rm -v "$PWD/tests:/srv/tests" cwm-backend python -m pytest tests -q
# single test: ... python -m pytest tests -q -k <name>   # e.g. -k test_gost or -k test_limits
```

The backend image copies only `app/` — tests are bind-mounted as a volume, so
edits under `tests/` show up without rebuilding, while edits under `app/`
require `docker build`.

Backend tests need no network and no database. External-image
tests use an HTTP MockTransport. CI checks that Pandoc is present and that the
DOCX output contains `m:oMath`; a local run without Pandoc skips that check
and does not substitute for verifying the production image.

Slash commands `/spec-review`, `/spec-audit`, `/adr` (`.claude/commands/`)
operate on the live `docs/` tree described above.

## Architecture

**Backend is a single FastAPI process** (`services/backend/Dockerfile`,
Pandoc installed from apt). `app/main.py` wires one router, `app/convert`
(`POST /api/convert/docx`, public). The former separate gateway/Java services
and a standalone AI service are gone (ADR-0010); accounts, JWT and PostgreSQL
are gone too (ADR-0012).

- **There is no database.** There is no server-side document storage — the document lives in the browser's localStorage; importing
  a previously exported archive uses `.zip` (`lib/docArchive.ts` /
  `lib/docImport.ts`). Don't add server-side document storage without an ADR.

**Frontend is React + Vite**, routes in `src/App.tsx`: `/` (HomePage),
`/editor`.

- **`EditorPage.tsx` owns state** (`md`, `settings`); mechanics live in hooks:
  `usePagination` (180ms debounce, restarts once mermaid/images are ready),
  `useDocPersistence` (localStorage, 700ms debounce), `useScrollSync`,
  `useCaretMarker`, `useZoom`, `useToast`.
- **Scroll sync and the caret marker** are a ~950-line subsystem layered on
  top of pagination. Both panes share one "currency": a *fractional* markdown
  line number. `lib/scrollSync.ts` converts editor `scrollTop` to a line and a
  line to an offset along the page ribbon; `lib/caretMap.ts` +
  `lib/caretLocate.ts` refine that to a character position inside a block to
  build a `Range` in the rendered preview. Generated pages are tagged
  `Page.generated`; sync excludes their height/gaps from interpolation and
  edge-snapping (`scrollSync.ts`) — while viewing them the editor stays put,
  and a recompute preserves the leading pane's position (for the title
  page/TOC: the page index within the section plus a relative offset; see
  [docs/specs/core.md#синхронная-прокрутка](docs/specs/core.md), ADR-0011).
  Intermediate points are linear interpolation between anchors (`Anchor` in
  `paginate.ts`, placed at block starts). **When editing anchor placement in
  `paginate.ts`, fix scroll sync too** — it drifts silently and happy-dom
  tests won't catch it. Arithmetic lives in `lib/`, only hooks touch the DOM;
  tests: `tests/lib/scrollSync.test.ts`, `caretMap.test.ts`,
  `caretLocate.test.ts`.
- **Preview page-ribbon geometry lives only in `lib/pageGeometry.ts`** (sheet
  size, margins, gap); line height only in `LINE_HEIGHT` /
  `LINE_HEIGHT_CODE` / `LINE_HEIGHT_SINGLE` in `gostRender.ts`. Consumers:
  layout (`PreviewPane`), auto-zoom (`useZoom`), scroll sync, the measurer
  (`HOST_CSS` in `paginate.ts`), and the dev harness (`PAGE_CSS` in
  `previewTest.ts`) — never copy these constants or the panes will silently
  drift apart. Exception to keep in mind: `PAGE_CONTENT_HEIGHT_PX` (971) in
  `paginate.ts` is a separate hardcoded number.
- **`lib/handoff.ts`** passes an uploaded `File` between pages once; a `File`
  cannot be carried reliably through router history state.
- **Images go through the `asset:img-…` indirection** (`lib/assets.ts`): the
  markdown holds only a short reference, the data URL lives in memory +
  localStorage. Never inline base64 into document text.
- **localStorage keys:** `md2docx:v1` (markdown + settings),
  `md2docx:assets:v1` (images). No token or user — API calls are anonymous.
- Long formula line-wrapping lives in `frontend/src/lib/mathWrap.ts`, inside
  pagination's hidden measurement DOM host. It only relies on `.base`
  boundaries produced by KaTeX and adds visual duplicate glyphs marked
  `data-math-repeat`; `caretLocate.ts` skips those duplicates when locating
  the caret.

## Storage, backup, and MVP security boundaries

- The document is local to the browser profile; there are no accounts and no
  server-side storage.
- `savePersisted` returns a boolean; there's no persistent "saved" indicator —
  on failure a toast plus a "Не сохранено · Повторить" chip in the preview. The ZIP-download button was
  removed from the UI; the debounced save also fires on leaving the editor or
  closing the tab. On a failed write the draft stays in memory for SPA
  navigation, and closing the tab prompts the browser's native confirmation.
  `loadPersisted` reads the on-disk copy; `loadEditorDraft` prefers an unsaved
  draft. Settings validate separately from content, so corrupt settings don't
  lose the text.
- Assets are added atomically (localStorage first, then memory); inserting a
  new image is rejected once the quota is hit. Assets are never deleted by
  autosave (kept for Undo) — this grows localStorage usage over time; future
  GC needs to account for undo history.
- The ZIP module is retained with tests but not exposed in the UI for export;
  import still works. ZIP v1 layout: `document.md`, `document.json`
  (version/settings/images), `images/…`. On import, assets get new keys.
  Import restores settings and the logo; plain `.md`/`.zip` import still
  works. The ZIP importer does not fetch external HTTP images — insert local
  files for a fully offline copy.
- ZIP limits: ≤32 MiB compressed/decompressed, ≤512 entries; known settings
  are type/range-checked on import. Decompression is async via `fflate` with
  a size filter applied before inflating. Markdown: ≤2M characters, ≤8 MiB
  per file.
- Backend: request body capped at 32 MiB before JSON decoding, ≤256 assets
  totaling ≤24 MiB of base64, ≤2 concurrent conversions per process (excess
  requests get 429). In compose the backend container is capped at 1 GiB
  memory, 2 CPUs, 128 PIDs, with all capabilities dropped.
- External images: HTTP(S) only, ports 80/443 only, all DNS answers must
  resolve to public IPs; the HTTP client connects to the validated IP while
  keeping the original Host/SNI, redirects and environment proxies are
  forbidden. Per-image stream capped at 10 MiB; up to 16 distinct external
  URLs per document, cached for the duration of one conversion.
- Inserted SVG/WebP/GIF are normalized to PNG for DOCX compatibility. Invalid
  XML characters in markdown or the title page are rejected by request
  validation.
- Regular images and logos are rendered at 96 px/in, matching the CSS
  preview, regardless of embedded DPI metadata; only rasterized Mermaid
  diagrams honor scale DPI.
- Mermaid runs in `strict` mode. Python code execution and all `/api/ai/*`
  routes have been removed (they now 404).
- The converter is public: rate limiting at the nginx/proxy level and TLS
  are open items before a public launch (ADR-0012).

## Key invariants

1. **Two parallel GOST renderers.** Preview (`markdown.ts` → `gostRender.ts`
   → `paginate.ts`) and DOCX (`convert/md_parser.py` → `convert/gost.py`) are
   implemented twice and must interpret the supported dialect the same way.
   Matching page numbers is a manual-acceptance criterion on fixed sample
   documents; exact layout parity isn't guaranteed for arbitrary input.
   Changing the dialect or formatting rules requires updating BOTH sides and
   both test suites (`frontend/tests/lib/gostRender.test.ts` ↔
   `services/backend/tests/convert/test_gost_layout.py`). Line-height metrics
   (GL-2) only ever change as a pair. DOCX listings use the `Code Block`
   style (Courier New 12pt) for the whole paragraph, wraps and blank lines
   included; `Unlisted Heading` keeps abstract/TOC-page heading style without
   being picked up by the TOC field via Heading 1 (see [Стили листингов и
   служебных заголовков](docs/specs/core.md#стили-листингов-и-служебных-заголовков)).
   The kalman-report fixture exists in two copies
   (`frontend/src/fixtures/` = `services/backend/tests/convert/data/`) — edit
   only as a pair. After touching pagination/rendering, run every dev-harness
   scenario (`http://localhost:5173/preview-test.html?doc=toc|code|wide|mixed|report&page=N`,
   dev server only) and cross-check page count/parity against the backend
   DOCX opened in Word/LibreOffice — page counts and TOC page numbers must match.
2. **Security (SEC-1).** There are no accounts; every route is public
   (ADR-0012). Don't add authentication, a database, or private routes
   without a new ADR; a public route must carry size and concurrency limits
   like `/api/convert/docx`.
3. **Editor overlay highlighting.** The `<textarea>` and the `<pre>` overlay
   layer must wrap lines identically: token styles may only set
   color/background/border-radius; the only exception is the frame around ```-blocks and $$…$$ formulas,
   a `display:block` span with background/border-radius and no
   padding/margin/border, which keeps the newline after the block inside it
   (`lib/highlight.ts` +
   `components/EditorPane.tsx`) — any padding, font, or letter-spacing on a
   token will desync the two layers. Visual check: dev harness
   `http://localhost:5173/highlight-test.html`.

## Test boundaries

Frontend unit tests run in happy-dom and **do not measure real layout**
(`offsetHeight` isn't computed there) — they check markup and render rules,
not where a page break actually lands. Pagination is only verified via the
dev harness in real Chrome plus a DOCX cross-check. Backend tests need no
database.

Dev harnesses are separate Vite pages, not application routes:
`frontend/preview-test.html` + `src/previewTest.ts` (page ribbons per
scenario, `?doc=…&page=N`) and `frontend/highlight-test.html` +
`src/highlightTest.ts` (highlight layers). They only exist on the dev server
(`npm run dev`) and are excluded from the production build.

When writing frontend tests, note `tests/setup.ts`: under vitest 4 +
happy-dom there is no working `localStorage` — a shared in-memory `Storage`
is substituted (cleared before every test), and RTL's auto-cleanup is wired
manually via `afterEach(cleanup)`. A test expecting a real `Storage` or
automatic cleanup from test globals will behave differently than it looks.

## Branches

- `develop` — main integration branch; new work branches from and merges
  back into it via PR. Working branches don't use a `codex/` prefix.
- `mvp-core` — current branch: removing the AI agent and fixing the storage
  core, as discrete commits; the final PR targets `develop`.
- `archive/ai-prototype` — preserved AI-era work and audit at commit
  `ec2fc07`. Don't modify or bulk-merge this archive; bringing AI back later
  means a fresh branch off current `develop`, adapting needed pieces.
- `main` — vetted releases cut from `develop`.

## Deployment gotchas

`docker compose restart` does **not** reload `.env` — use
`docker compose up -d <service>` instead. Docker builds sometimes silently
reuse a cached layer — after deploying, verify the artifact inside the
container matches (backend: grep for the change in `app/convert/gost.py`;
frontend: compare the `index-<hash>.js` bundle name in `dist/` against what's
in the container).
