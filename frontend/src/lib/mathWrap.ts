/** Перенос KaTeX по разрешённым самим движком границам (.base).
 * Дроби, индексы и скобочные конструкции остаются неделимыми.
 * Вызывается в измерителе до расчёта высоты страницы; исходный LaTeX не меняется.
 */
export function wrapDisplayMath(root: HTMLElement): void {
  for (const box of root.querySelectorAll<HTMLElement>('[data-display-math]')) {
    const math = box.querySelector<HTMLElement>('.katex-html')
    if (!math) continue
    const bases = Array.from(math.children) as HTMLElement[]
    if (!bases.length || bases.some((base) => !base.classList.contains('base'))) continue
    const width = box.getBoundingClientRect().width
    if (width <= 0) continue
    const widths = bases.map((base) => base.getBoundingClientRect().width)
    if (widths.reduce((sum, w) => sum + w, 0) <= width) continue
    const operators = bases.map(base => {
      const matches = base.querySelectorAll<HTMLElement>(':scope > .mbin, :scope > .mrel')
      const node = matches[matches.length - 1]
      return node ? { node, width: node.getBoundingClientRect().width } : null
    })
    const lines: HTMLElement[] = []
    let line = document.createElement('span')
    line.style.display = 'block'
    line.style.whiteSpace = 'nowrap'
    let used = 0
    for (let i = 0; i < bases.length; i++) {
      if (i > 0 && used + widths[i] > width) {
        // KaTeX помещает знак в конец предыдущего .base. Дублируем только
        // видимый знак на границе; MathML для доступности остаётся исходным.
        const operator = operators[i - 1]
        if (operator) {
          lines.push(line)
          line = document.createElement('span')
          line.style.display = 'block'
          line.style.whiteSpace = 'nowrap'
          const duplicate = operator.node.cloneNode(true) as HTMLElement
          duplicate.dataset.mathRepeat = ''
          duplicate.setAttribute('aria-hidden', 'true')
          line.append(duplicate)
          used = operator.width
        }
      }
      line.append(bases[i])
      used += widths[i]
    }
    lines.push(line)
    math.replaceChildren(...lines)
  }
}
