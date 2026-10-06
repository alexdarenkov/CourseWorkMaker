import { describe, expect, it } from 'vitest'
import { splitHtmlAtHeight } from '../../src/lib/splitHtml'
import { katexHtml } from '../../src/lib/markdown'

const text = (html: string) => {
  const el = document.createElement('div')
  el.innerHTML = html
  return el.textContent || ''
}

describe('MVP-14 — сохранность HTML при разрезе абзаца', () => {
  it('сохраняет текст и вложенное оформление обеих частей', () => {
    const html = 'Начало <b>первое <i>второе третье</i> последнее</b> конец.'
    const result = splitHtmlAtHeight(html, 28, (s) => text(s).length)!
    expect(text(result.head) + text(result.tail)).toBe(text(html))
    expect(result.head).toContain('<b>')
    expect(result.tail).toContain('<b>')
    expect(result.headH).toBeLessThanOrEqual(28)
  })

  it('переносит KaTeX целиком, включая MathML и визуальный слой', () => {
    const formula = katexHtml('\\frac{x + y}{z}', false)
    const html = 'Начало ' + formula + ' конец абзаца.'
    const measure = (s: string) => {
      const el = document.createElement('div')
      el.innerHTML = s
      el.querySelectorAll('.katex').forEach((k) => k.replaceWith('FORMULA'))
      return el.textContent!.length
    }
    const result = splitHtmlAtHeight(html, 10, measure)!
    expect(result.head).toBe('Начало ')
    expect(result.tail).toContain(formula)
    expect(result.head).not.toContain('katex')
    const after = splitHtmlAtHeight(html, 16, measure)!
    expect(after.head).toContain(formula)
    expect(after.tail).not.toContain('katex')
    expect(text(after.head) + text(after.tail)).toBe(text(html))
  })

  it('не разрывает неразрывный пробел и не отдаёт пустой хвост', () => {
    expect(splitHtmlAtHeight('номер&nbsp;один', 6, (s) => text(s).length)).toBeNull()
    expect(splitHtmlAtHeight('всё помещается ', 100, (s) => text(s).length)).toBeNull()
  })
})
