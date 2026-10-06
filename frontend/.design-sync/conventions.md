## Texturn UI Kit — build with these components

**Wrapping.** `AppHeader` calls `useNavigate()` (react-router) and reads auth
state — wrap any composition that uses it in a `<BrowserRouter>` (a plain
memory/browser router with no routes configured is enough; it only needs a
router context to exist, not real routes). No other component in this kit
needs a provider.

**Styling idiom: Tailwind utility classes bound to CSS custom properties, not
hard-coded colors.** Every surface/text/border color is a semantic Tailwind
class mapped to a `var(--*)` token, and the same tokens are directly
available as CSS variables for cases a utility class doesn't cover (e.g.
inline `style={{ background: 'var(--toggle-off)' }}`). Never write a literal
hex color — always reach for one of these:

| Use | Tailwind class | Raw token |
|---|---|---|
| Page background | `bg-paper` | `--paper` |
| Card/panel background | `bg-surface` | `--surface` |
| Primary text | `text-ink` | `--ink` |
| Secondary text | `text-soft` | `--soft` |
| Muted/tertiary text | `text-muted`, `text-faint` | `--muted`, `--faint` |
| Accent (buttons, links, active states) | `bg-accent`, `text-accent` | `--accent`, `--accent-dark`, `--accent-bg` |
| Hairline borders | `border-line`, `border-edge` | `--line`, `--edge` |
| Hover fill | `bg-hover` | `--hover`, `--hover-2` |
| Destructive | `text-danger` | `--danger`, `--danger-dark` |
| Toggle track (off state) | — | `--toggle-off` |
| Active segment background (SegButton) | — | `--seg-active` |
| Modal overlay scrim | — | `--overlay` |
| Small pill/badge (chip) | — | `--chip-bg` / `--chip-text` |

Every one of these tokens is redefined under `.dark` — toggling the `dark`
class on the root element switches the whole kit's theme with no per-component
work. Never assume a light-mode value; always go through the token.

**Fonts.** Three families, each with a job — don't mix them up: `font-serif`
(Newsreader) for headings and the wordmark, the default sans (Instrument
Sans) for all other UI text, `font-mono` (JetBrains Mono) only for
code/editor-like content.

**Where the truth lives.** `styles.css` at this kit's root has the full
token list (`:root` for light, `.dark` for dark) — read it before styling
anything this table doesn't cover. Each component's own `.prompt.md` has its
realistic usage examples; read those before composing with a component you
haven't used yet, rather than guessing its API from the name.

**A real composition**, straight from one of this kit's own previews — a
settings row with a toggle, the single most common pattern in this kit:

```tsx
import { SettingRow, Toggle } from 'md2docx-frontend'

<SettingRow label="Содержание" desc="Автогенерация из заголовков с номерами страниц">
  <Toggle on={on} onToggle={() => setOn((v) => !v)} />
</SettingRow>
```
