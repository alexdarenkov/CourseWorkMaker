/** Dev-проверка подсветки редактора: /highlight-test.html на dev-сервере. */

import { edColors, highlight } from './lib/highlight'

const SAMPLE = `# Раздел с кодом

Текст с **жирным** и $x^2$.

\`\`\`python
def kalman_step(x, p, z, r=0.1):
    """Один шаг фильтра."""
    k = p / (p + r)  # коэффициент усиления
    x_new = x + k * (z - x)
    return x_new, (1 - k) * p

print("оценка:", kalman_step(1.0, 0.5, 1.2))
\`\`\`

\`\`\`sql
SELECT id, name FROM students WHERE rating > 4.5 ORDER BY name; -- отличники
\`\`\`

\`\`\`java
public static int sum(int[] xs) {
    int acc = 0; // аккумулятор
    for (int x : xs) acc += x;
    return acc;
}
\`\`\`

\`\`\`mermaid
flowchart LR
  A[Данные] --> B{Фильтр}
\`\`\`
`

const root = document.getElementById('root')!
for (const theme of ['light', 'dark'] as const) {
  const C = edColors(theme)
  const box = document.createElement('pre')
  box.setAttribute(
    'style',
    `margin:12px;padding:18px 22px;border-radius:10px;background:${C.bg};color:${C.text};` +
      "font:14px 'JetBrains Mono',ui-monospace,Menlo,monospace;line-height:1.65;white-space:pre-wrap",
  )
  box.innerHTML = highlight(SAMPLE, C)
  root.appendChild(box)
}
