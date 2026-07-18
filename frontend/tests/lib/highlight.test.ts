/**
 * Подсветка markdown-редактора. Главное — overlay-инвариант
 * (docs/architecture/overview.md, «Frontend: ключевые модули»): слой <pre>
 * обязан сохранять метрики глифов textarea, поэтому inline-стили токенов
 * могут менять ТОЛЬКО color/background/border-radius, а текст после снятия
 * тегов обязан побайтно совпадать с исходником (включая маркеры ** и `).
 */
import { describe, expect, it } from 'vitest'
import { edColors, highlight } from '../../src/lib/highlight'

const DOC = [
  '# Заголовок с **жирным**',
  'Текст с *курсивом*, `коде < 1`, $x^2$ и [ссылкой](https://x).',
  '![схема](asset:img-1)',
  'Рисунок: Схема системы',
  '- пункт списка',
  '1. нумерованный',
  '> цитата',
  '$$E=mc^2$$',
  '```python',
  'def f(x):  # комментарий "с кавычками"',
  '    return "строка" + str(3.14)',
  '```',
  '```sql',
  "select id from users where name = 'а' -- хвост",
  '```',
  '```неизвестный',
  'просто текст 42',
  '```',
  'обычный хвост с 2 < 3 и "кавычками"',
].join('\n')

/** Снимает теги и HTML-экранирование — остаётся то, что видит пользователь. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

describe('overlay-инвариант подсветки', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`тема ${theme}: inline-стили содержат только color/background/border-radius`, () => {
      const out = highlight(DOC, edColors(theme))
      const styles = [...out.matchAll(/style="([^"]*)"/g)].map((m) => m[1])
      expect(styles.length).toBeGreaterThan(0)
      for (const style of styles) {
        for (const decl of style.split(';').filter(Boolean)) {
          const prop = decl.split(':')[0].trim()
          expect(['color', 'background', 'border-radius']).toContain(prop)
        }
      }
    })

    it(`тема ${theme}: текст после снятия тегов совпадает с исходником`, () => {
      const out = highlight(DOC, edColors(theme))
      expect(plainText(out)).toBe(DOC)
      expect(out.split('\n')).toHaveLength(DOC.split('\n').length)
    })
  }
})

describe('токены кода', () => {
  const C = edColors('light')

  it('fence-переключение: внутри ```python ключевые слова подсвечены, снаружи — нет', () => {
    const lines = highlight('```python\nreturn x\n```\nreturn x', C).split('\n')
    expect(lines[1]).toContain('color:' + C.codeKw)
    expect(lines[3]).not.toContain('color:' + C.codeKw)
  })

  it('комментарий «съедает» строку внутри себя', () => {
    const out = highlight('```python\nx = 1  # тут "не строка"\n```', C).split('\n')[1]
    expect(out).toContain('color:' + C.codeCom)
    // Кавычки внутри комментария не образуют отдельного строкового токена.
    expect(out).not.toContain('<span style="color:' + C.codeStr + '">&quot;не строка&quot;</span>')
  })

  it('sql: регистронезависимые ключевые слова и строки в одинарных кавычках', () => {
    const out = highlight("```sql\nSELECT 'имя' FROM t\n```", C).split('\n')[1]
    expect(out).toContain('color:' + C.codeKw)
    expect(out).toContain('color:' + C.codeStr)
  })

  it('неизвестный язык: подсвечиваются только строки и числа', () => {
    const out = highlight('```текст\nselect 42 "строка"\n```', C).split('\n')[1]
    expect(out).not.toContain('color:' + C.codeKw)
    expect(out).toContain('color:' + C.codeNum)
    expect(out).toContain('color:' + C.codeStr)
  })
})

describe('палитры тем', () => {
  it('светлая и тёмная темы дают разные цвета, все ключи заполнены', () => {
    const light = edColors('light')
    const dark = edColors('dark')
    expect(light.bg).not.toBe(dark.bg)
    for (const v of [...Object.values(light), ...Object.values(dark)]) {
      expect(v).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('auto использует светлую палитру (тему решает applyTheme, не подсветка)', () => {
    expect(edColors('auto')).toEqual(edColors('light'))
  })
})
