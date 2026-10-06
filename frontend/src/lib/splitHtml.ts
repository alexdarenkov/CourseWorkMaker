/** Разрез абзаца по словам. Формулы и другие вложенные атомарные элементы
 * переносятся целиком; Range сохраняет оформление обеих частей. */
export function splitHtmlAtHeight(
  html: string,
  budget: number,
  measure: (html: string) => number,
): { head: string; tail: string; headH: number } | null {
  const source = document.createElement('div')
  source.innerHTML = html
  const boundaries: { node: Node; offset: number }[] = []
  const visit = (parent: Node) => {
    Array.from(parent.childNodes).forEach((node, index) => {
      if (node instanceof Element && node.matches('.katex, svg, img, math')) {
        boundaries.push({ node: parent, offset: index + 1 })
      } else if (node.nodeType === Node.TEXT_NODE) {
        // NBSP связывает номер/обозначение со следующим словом.
        for (const m of (node.textContent || '').matchAll(/[ \t\n]+/g)) {
          boundaries.push({ node, offset: m.index! + m[0].length })
        }
      } else {
        visit(node)
      }
    })
  }
  visit(source)
  const serialize = (range: Range) => {
    const div = document.createElement('div')
    div.appendChild(range.cloneContents())
    return div.innerHTML
  }
  const headAt = (index: number) => {
    const range = document.createRange()
    range.selectNodeContents(source)
    const at = boundaries[index]
    range.setEnd(at.node, at.offset)
    return serialize(range)
  }
  let lo = 0
  let hi = boundaries.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (measure(headAt(mid)) <= budget) {
      best = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (best < 0) return null
  const at = boundaries[best]
  const range = document.createRange()
  range.selectNodeContents(source)
  range.setStart(at.node, at.offset)
  const tail = serialize(range)
  if (!range.toString().trim() && !range.cloneContents().querySelector('.katex, svg, img, math')) return null
  const head = headAt(best)
  return { head, tail, headH: measure(head) }
}
