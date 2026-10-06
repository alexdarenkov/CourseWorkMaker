# design-sync notes — Texturn UI Kit

## Setup, not a real component library

`frontend/` is a Vite app, not a published component library — `package.json`
has no `main`/`module`/`exports`. The converter's `--entry` was pointed at a
hand-written `.design-sync/entry.ts` that re-exports exactly the synced
components from `src/components/ui.tsx`, `AppHeader.tsx`, and `icons.tsx`
(plus `BrowserRouter`/`AuthProvider`, excluded from the component list via
`componentSrcMap: null`, needed only as `cfg.provider` for `AppHeader`).

**Gotcha (cost real time to find):** passing `--entry` makes the converter
treat that file as a pre-built `dist` entry, which routes component discovery
through `exportedNames()`/`findTypesRoot()` (real `.d.ts` scanning) instead of
the synth-entry `deriveComponentsFromSrc` scan — and this repo has no real
`.d.ts` for its components (`findTypesRoot` only found the unrelated
`vite-env.d.ts`), so the first build reported `[ZERO_MATCH]`/0 components even
though the bundle itself built fine. Fix: every synced component name is
pinned explicitly in `cfg.componentSrcMap` (non-null path), which populates
`names` before the synth-fallback branch is ever reached — so the custom
`--entry` bundle stays clean/curated (no whole-`src/`-tree `export *`, which
would pull in `main.tsx`'s top-level `createRoot(...).render(...)` and crash).
**On re-sync: if a new component is added to the DS scope, it must be added
to BOTH `.design-sync/entry.ts` (re-export) AND `cfg.componentSrcMap` (pin) —
adding it to only one will not surface it.**

## cssEntry is not the raw source

`src/index.css` only has `@tailwind base/components/utilities` directives —
no compiled classes. `cfg.cssEntry` points at `.design-sync/compiled.css`, a
**copy** of the Vite build output (`dist/assets/index-*.css`, hash changes
every build). **Re-sync must re-run `npm run build` in `frontend/` and re-copy
the freshly hashed CSS file over `.design-sync/compiled.css` before running
the converter**, or `cssEntry` goes stale (missing new Tailwind classes used
by any newly-touched component).

## Known render warns (checked, benign — don't re-chase these)

- **All ~40 icon components** (`GearIcon`, `CheckIcon`, ... `Spinner`): floor
  cards only (user's explicit scope choice — icons are one-shape, not worth
  authoring 40 individual preview files). `[RENDER_BLANK]` fires for nearly
  all of them (`<5KB` PNG) — confirmed via contact-sheet screenshots this is
  a false positive of the byte-size heuristic for a single small glyph on an
  otherwise-white card, not an actual empty render. Authorable later on any
  re-sync if the user wants richer icon cards.
- **`IconButton`**: `[RENDER_THIN]` "mounts have no text and paint nothing" —
  false positive; icon-only buttons legitimately have zero text nodes.
  Confirmed via `_screenshots/review/general__IconButton.png`: both `Toolbar`
  and `Compact` stories render correctly (real icon glyphs, correct spacing).
- **`ModalShell`**: `[RENDER_THIN]` "DOM content present but rendered height
  is 0px", and the local single-card capture (`cardMode: "single"`) clips the
  panel at the top of the frame — confirmed this is viewport-size-invariant
  (tested `420x420`, `560x560`, and the `900x700` default: byte-identical
  clipping every time), so it's a structural interaction between this local
  harness and the component's own `position: fixed; inset: 0` overlay
  (portal/fixed-position collapse, exactly the category the validator's own
  hint names), not something fixable via composition alone (ModalShell's
  source can't be edited — composition-only rule). Content itself (header,
  close button, description) is present, styled, and complete when inspected
  directly (`_screenshots/review/raw/general__ModalShell__Default.png`).
  Graded `good` on that basis. **Re-sync risk:** if this still looks wrong
  once opened in the actual claude.ai/design pane (the true rendering
  environment, not this local harness), the fix belongs in a future
  `.design-sync/previews/ModalShell.tsx` rework or a `cardMode`/`viewport`
  tweak — re-open and eyeball it after the first upload.
- **`[FONT_DANGLING]` (12 KaTeX font files)**: expected — `index.css` imports
  `katex/dist/katex.min.css` for the app's math rendering, but no synced
  component in this scope uses KaTeX, so those `@font-face` rules are dead
  weight pulled in by reusing the whole compiled app stylesheet. Harmless;
  not worth trimming for a UI-primitives-only sync.

## Brand fonts (resolved)

`[FONT_MISSING]` originally fired for "Instrument Sans", "JetBrains Mono",
"Newsreader": they're loaded via a `<link>` tag in `index.html` pointing at
Google Fonts, not via any `@font-face` the CSS scraper can see, so none
shipped with the bundle by default. Fixed by sourcing the real woff2 files
(all three are open, SIL OFL-licensed Google Fonts — the same files
`index.html` already points at): fetched `https://fonts.googleapis.com/css2?...`
with a modern desktop user-agent (needed for woff2, not older formats),
filtered to the `latin`/`latin-ext`/`cyrillic`/`cyrillic-ext` subsets (this is
a Russian-language app; dropped `greek`/`vietnamese`), rewrote the `url()`s to
local relative paths, and downloaded the 38 resulting files into
`.design-sync/fonts-src/files/` (~1.7 MB). Wired via
`cfg.extraFonts: [".design-sync/fonts-src/brand-fonts.css"]`. Confirmed
`[FONT_MISSING]` no longer fires after rebuild. **Re-sync risk:** if the app's
`index.html` font `<link>` ever changes weights/families, `brand-fonts.css`
needs regenerating the same way — it won't auto-update.

## Re-sync risks

- Grades are keyed by component name+source hash; adding/removing an export
  from `ui.tsx`/`icons.tsx`/`AppHeader.tsx` needs the matching
  `componentSrcMap`/`entry.ts` update above or it silently won't appear.
- `.design-sync/compiled.css` is machine-generated but committed (not
  gitignored) so a sync always has a `cssEntry` to point at even before a
  fresh `npm run build` — but it WILL be stale until the next build+copy step
  runs. Consider gitignoring it and always requiring the rebuild step if it
  causes confusion later.
- `.design-sync/fonts-src/brand-fonts.css` + `files/` are committed
  (durable) but hand-generated from a point-in-time fetch of Google Fonts —
  not regenerated automatically by any script.
