/**
 * Поиск места каретки в готовом превью: какой элемент вывода соответствует
 * строке markdown и какое место его текста соответствует колонке.
 *
 * Элемент ищется по метке строки (`data-l`, её ставит renderAll), а не по
 * геометрии: подпись рисунка, строка таблицы, пункт перечисления и абзац имеют
 * каждый свою метку, поэтому каретка попадает именно туда, что написано в
 * текущей строке. Внутри элемента место ищется обходом текста (caretMap.ts).
 * Координаты по найденному месту берёт хук useCaretMarker.
 */
import {
  cellAt,
  codeTextOffset,
  lineMarkerLength,
  mathGlyphs,
  mathPrefix,
  mermaidLabelAt,
  scanText,
  textPosAt,
  visibleText,
  type TextPos,
} from './caretMap'
import type { Block } from './markdown'

/**
 * Найденное место каретки. node/offset заданы, если каретка адресуется
 * посимвольно; иначе каретка относится к элементу целиком (формула, картинка,
 * схема — текста, соответствующего исходнику, там нет).
 */
export interface CaretSpot {
  el: HTMLElement
  node?: Text
  offset?: number
}

/** Позиция «в самом начале текста». */
const START: TextPos = { plain: 0, formulas: 0, inFormula: false }

/** Элементы, помеченные строкой исходника, в порядке документа. */
export function byLine(strip: HTMLElement, line: number | undefined): HTMLElement[] {
  if (line === undefined) return []
  return Array.from(strip.querySelectorAll<HTMLElement>('[data-l="' + line + '"]'))
}

/**
 * Место каретки ВНУТРИ отрисованной формулы: номер глифа переводится в
 * текстовый узел вывода KaTeX. Скрытая копия MathML пропускается — в ней те же
 * символы плюс исходный LaTeX, и она вынесена из потока (каретка уехала бы
 * в непредсказуемое место). Нулевой ширины и пробельные символы KaTeX ставит
 * для вёрстки — они не глифы.
 */
function glyphSpot(katex: HTMLElement, want: number): CaretSpot | null {
  const html = katex.querySelector<HTMLElement>('.katex-html') ?? katex
  let seen = 0
  let tail: CaretSpot | null = null

  const scan = (node: Node): CaretSpot | null => {
    for (let ch = node.firstChild; ch; ch = ch.nextSibling) {
      if (ch.nodeType === Node.TEXT_NODE) {
        const text = ch as Text
        for (let k = 0; k < text.data.length; k++) {
          const code = text.data.charCodeAt(k)
          if (code === 0x200b || code === 0x20 || code === 0xa0) continue
          if (seen === want) return { el: katex, node: text, offset: k }
          seen++
          tail = { el: katex, node: text, offset: k + 1 }
        }
        continue
      }
      if (ch.nodeType !== Node.ELEMENT_NODE) continue
      const el = ch as HTMLElement
      if (el.classList.contains('katex-mathml')) continue
      const found = scan(el)
      if (found) return found
    }
    return null
  }
  return scan(html) ?? tail
}

/**
 * Ищет в тексте элементов место, описанное позицией pos. Элементов может быть
 * несколько — длинный блок пагинатор режет между страницами.
 *
 * Формула (корневой элемент KaTeX) — неделимый атом: внутрь не заходим, там
 * лежат и глифы, и СКРЫТАЯ копия MathML с исходным LaTeX, и попавшая туда
 * каретка уезжала бы в непредсказуемое место (скрытая копия вынесена из
 * потока). Каретка внутри формулы показывается на самой формуле.
 */
export function locateInText(els: HTMLElement[], pos: TextPos): CaretSpot | null {
  let plain = pos.plain
  let formulas = pos.formulas
  let tail: CaretSpot | null = null

  const scan = (node: Node, root: HTMLElement): CaretSpot | null => {
    for (let ch = node.firstChild; ch; ch = ch.nextSibling) {
      if (ch.nodeType === Node.TEXT_NODE) {
        const text = ch as Text
        const len = text.data.length
        // Строго «<»: на стыке узлов (перенос <br> внутри абзаца) каретка
        // встаёт в начало СЛЕДУЮЩЕЙ строки, а не в конец предыдущей.
        if (!pos.inFormula && plain < len) return { el: root, node: text, offset: plain }
        plain -= len
        tail = { el: root, node: text, offset: len }
        continue
      }
      if (ch.nodeType !== Node.ELEMENT_NODE) continue
      const el = ch as HTMLElement
      if (el.classList.contains('katex')) {
        if (pos.inFormula && formulas === 0) {
          return glyphSpot(el, mathGlyphs(pos.math ?? '')) ?? { el }
        }
        formulas--
        continue
      }
      const found = scan(el, root)
      if (found) return found
    }
    return null
  }

  for (const root of els) {
    const found = scan(root, root)
    if (found) return found
  }
  // Позиция за концом текста — конец последнего узла.
  return tail ?? (els[0] ? { el: els[0] } : null)
}

/**
 * Автонумерация и маркеры добавляют в вывод символы, которых в исходнике нет
 * («1 Название», «– пункт», «Рисунок 2 – Схема»). Ищем, с какого места в
 * отрендеренном тексте начинается текст исходной строки, и сдвигаем позицию
 * на эту величину. Не нашли (структурный заголовок выведен ПРОПИСНЫМИ) — сдвиг
 * нулевой: длина при смене регистра не меняется, позиция и так верная.
 */
function alignBase(el: HTMLElement, src: string): number {
  // Маркер исходника («# », «- ») в вывод не идёт — ищем текст без него.
  const probe = visibleText(src.slice(lineMarkerLength(src))).trim().slice(0, 12)
  if (probe.length < 3) return 0
  const at = (el.textContent || '').indexOf(probe)
  return at > 0 ? at : 0
}

/**
 * Элемент отрисованной схемы, показывающий подпись узла. Подписи mermaid
 * выводит как SVG-текст (htmlLabels выключены), длинные — разбивает на
 * несколько tspan'ов, поэтому кроме точного совпадения принимаем и начало.
 */
function labelNode(root: HTMLElement, text: string): HTMLElement | null {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('tspan, text, span, p'))
  const leaf = (el: HTMLElement) => el.querySelectorAll('*').length === 0
  const exact = nodes.filter((el) => (el.textContent || '').trim() === text)
  if (exact.length) return exact.find(leaf) ?? exact[0]
  const part = nodes.filter((el) => {
    const t = (el.textContent || '').trim()
    return t.length > 0 && text.startsWith(t)
  })
  return part.find(leaf) ?? part[0] ?? null
}

/**
 * Ближайший помеченный элемент выше по документу. Нужен, когда элемента для
 * строки в превью ещё нет (страницы пересчитываются с задержкой после ввода):
 * лучше показать каретку рядом, чем убрать её совсем.
 */
function nearest(strip: HTMLElement, line: number): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestLine = -1
  for (const el of Array.from(strip.querySelectorAll<HTMLElement>('[data-l]'))) {
    const l = Number(el.dataset.l)
    if (Number.isNaN(l) || l > line || l < bestLine) continue
    bestLine = l
    best = el
  }
  return best
}

/** Запасной вариант: ближайший элемент выше, без адресации по тексту. */
function fallback(strip: HTMLElement, line: number): CaretSpot | null {
  const el = nearest(strip, line)
  return el ? { el } : null
}

/** Блок, которому принадлежит строка (подпись рисунка/таблицы — тоже его). */
function blockAt(blocks: Block[], line: number): Block | null {
  let after: Block | null = null
  for (const b of blocks) {
    if (b.captionLine === line) return b
    if (b.line !== undefined && b.line <= line && line <= (b.endLine ?? b.line)) return b
    if (after === null && b.line !== undefined && b.line > line) after = b
  }
  // Строка ничего не породила (разделитель таблицы, лишний перенос внутри
  // конструкции) — целимся в начало следующего блока.
  return after ?? blocks[blocks.length - 1] ?? null
}

/** Куда именно ставить каретку. */
export function locateCaret(
  strip: HTMLElement,
  blocks: Block[],
  lines: string[],
  line: number,
  col: number,
): CaretSpot | null {
  const b = blockAt(blocks, line)
  if (!b) return fallback(strip, line)
  const raw = lines[line] ?? ''

  // Подпись «Рисунок: …» / «Таблица: …»: своя метка и свой элемент вывода.
  if (b.captionLine === line) {
    const els = byLine(strip, line)
    if (els.length === 0) return fallback(strip, line)
    const cut = /^\s*(?:Рисунок|Таблица):\s*/i.exec(raw)?.[0].length ?? 0
    const body = raw.slice(cut)
    const pos = scanText(body.slice(0, Math.max(0, col - cut)))
    return locateInText(els, { ...pos, plain: pos.plain + alignBase(els[0], body) })
  }

  if (b.type === 'ul' || b.type === 'ol') {
    const els = byLine(strip, line)
    if (els.length === 0) return fallback(strip, line)
    const cut = lineMarkerLength(raw)
    const pos = scanText(raw.slice(cut, Math.max(cut, col)))
    return locateInText(els, { ...pos, plain: pos.plain + alignBase(els[0], raw) })
  }

  if (b.type === 'table') {
    // Метку строки таблицы носит <tr>; тот же номер есть у обёртки и у
    // <table> (блок начинается той же строкой) — берём именно строку.
    const tr = byLine(strip, line).find((el) => el.tagName === 'TR')
    if (!tr) {
      const el = byLine(strip, b.line)[0]
      return el ? { el } : fallback(strip, line)
    }
    const cell = cellAt(raw, col)
    const td = tr.children[cell.index] as HTMLElement | undefined
    return td ? locateInText([td], scanText(cell.before)) : { el: tr }
  }

  if (b.type === 'code') {
    const els = byLine(strip, b.line)
    if (els.length === 0) return fallback(strip, line)
    return locateInText(els, {
      ...START,
      plain: codeTextOffset(lines, b.line ?? line, line, col),
    })
  }

  // Схема: в исходнике текст живёт в подписях узлов и связей — если каретка
  // в такой подписи, ищем её в отрисованном SVG и встаём прямо в неё.
  if (b.type === 'mermaid') {
    const el = byLine(strip, b.line)[0]
    if (!el) return fallback(strip, line)
    const label = mermaidLabelAt(raw, col)
    const node = label ? labelNode(el, label.text) : null
    if (label && node) return locateInText([node], { ...START, plain: label.offset })
    // Каретка в синтаксисе схемы (стрелки, имена узлов) — ей соответствует
    // сама схема, а не текст в ней.
    return { el: (el.querySelector('svg, img') as HTMLElement) ?? el }
  }

  // Выключная формула: символ исходника и глиф вывода один в один не ложатся,
  // но идут в одном порядке — целимся по номеру глифа.
  if (b.type === 'math') {
    const el = byLine(strip, b.line)[0]
    if (!el) return fallback(strip, line)
    const katex = el.querySelector<HTMLElement>('.katex')
    if (!katex) return { el }
    const prefix = mathPrefix(lines, b.line ?? line, line, col)
    return glyphSpot(katex, mathGlyphs(prefix)) ?? { el: katex }
  }

  // Картинка: текста, отвечающего исходнику, нет — встаём к самому объекту.
  if (b.type === 'figure') {
    const el = byLine(strip, b.line)[0]
    if (!el) return fallback(strip, line)
    return { el: (el.querySelector('img, svg') as HTMLElement) ?? el }
  }

  // Абзац, цитата, заголовок, пустая строка: текст блока в одном элементе,
  // строки внутри склеены переносами.
  const els = byLine(strip, b.line)
  if (els.length === 0) return fallback(strip, line)
  const start = b.line ?? line
  const pos = textPosAt(lines, start, line, col)
  return locateInText(els, { ...pos, plain: pos.plain + alignBase(els[0], lines[start] ?? '') })
}
