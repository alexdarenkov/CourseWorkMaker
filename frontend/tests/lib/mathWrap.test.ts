import { describe, expect, it } from 'vitest'
import { wrapDisplayMath } from '../../src/lib/mathWrap'

function rect(width: number): DOMRect {
  return { width, height: 20, top: 0, left: 0, right: width, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
}

describe('перенос отображаемых формул', () => {
  it('переносит по знакам и повторяет знак в начале следующей строки', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div data-display-math><span class="katex"><span class="katex-html"></span></span></div>'
    const box = root.firstElementChild as HTMLElement
    const math = root.querySelector('.katex-html') as HTMLElement
    Object.defineProperty(box, 'getBoundingClientRect', { value: () => rect(90) })
    for (const [text, width] of [['x', 45], ['+', 10], ['y', 45], ['+', 10], ['z', 45]] as const) {
      const base = document.createElement('span')
      base.className = 'base'
      const glyph = document.createElement('span')
      glyph.textContent = text
      if (text === '+') glyph.className = 'mbin'
      base.append(glyph)
      Object.defineProperty(base, 'getBoundingClientRect', { value: () => rect(width) })
      Object.defineProperty(glyph, 'getBoundingClientRect', { value: () => rect(width) })
      math.append(base)
    }
    wrapDisplayMath(root)
    const lines = [...math.children] as HTMLElement[]
    expect(lines).toHaveLength(3)
    expect(lines.map(line => line.textContent)).toEqual(['x+', '+y+', '+z'])
    expect(math.querySelectorAll('[data-math-repeat]')).toHaveLength(2)
  })

  it('не разрезает формулу, если KaTeX не дал базовых границ', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div data-display-math><span class="katex"><span class="katex-html"><span class="mfrac">x/y</span></span></span></div>'
    const box = root.firstElementChild as HTMLElement
    Object.defineProperty(box, 'getBoundingClientRect', { value: () => rect(20) })
    wrapDisplayMath(root)
    expect(root.querySelectorAll('[data-math-repeat]')).toHaveLength(0)
    expect(root.querySelector('.mfrac')?.textContent).toBe('x/y')
  })
})
