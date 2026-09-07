/**
 * Где стоит каретка редактора в ТЕКСТЕ превью.
 *
 * Прокрутка (scrollSync.ts) работает со строками — этого хватает, чтобы найти
 * страницу. Каретке нужно точнее: смещение в символах внутри блока, чтобы по
 * нему построить Range и взять координаты прямо из отрендеренного текста.
 *
 * Отображение приблизительное там, где разметка меняет текст непропорционально:
 *  - `$формула$` выводится KaTeX'ом, посимвольного соответствия нет — считаем
 *    её содержимое как обычный текст;
 *  - автонумерация заголовков и маркеры перечислений добавляют символы, которых
 *    в исходнике нет, — это выравнивается уже по отрендеренному тексту
 *    (см. alignBase в useCaretMarker).
 * Внутри обычного текста (а это почти вся курсовая) соответствие точное.
 */

/** Номер строки (0-based), в которой стоит каретка. */
export function caretLine(value: string, pos: number): number {
  let line = 0
  const n = Math.max(0, Math.min(pos, value.length))
  for (let i = 0; i < n; i++) if (value.charCodeAt(i) === 10) line++
  return line
}

/** Позиция каретки внутри своей строки (в символах от её начала). */
export function caretColumn(value: string, pos: number): number {
  const n = Math.max(0, Math.min(pos, value.length))
  const nl = value.lastIndexOf('\n', n - 1)
  return n - (nl + 1)
}

/**
 * Текст строки в том виде, в каком он попадает в вывод: inline-разметка снята,
 * содержимое оставлено. Зеркалит замены inline() в markdown.ts.
 */
export function visibleText(src: string): string {
  return String(src)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
}

/** Длина маркера в начале строки (#, дефис, номер пункта, цитата) — в вывод он не идёт. */
export function lineMarkerLength(src: string): number {
  const m = /^\s*(?:#{1,6}\s+|[-*]\s+|\d+[.)]\s+|>\s?)/.exec(src)
  return m ? m[0].length : 0
}

/**
 * Позиция каретки в тексте блока: сколько ОБЫЧНЫХ символов и сколько формул
 * лежит до неё и не стоит ли она внутри формулы.
 *
 * Формулы считаются отдельно и как неделимые: `$…$` выводит KaTeX, у которого
 * с исходником нет посимвольного соответствия (в выводе и глифы, и скрытая
 * копия MathML с исходным LaTeX). Поэтому смещение в тексте меряется только по
 * обычным символам, а формулы адресуются порядковым номером.
 */
export interface TextPos {
  plain: number
  formulas: number
  inFormula: boolean
  /** LaTeX формулы до каретки — если каретка внутри неё (inFormula). */
  math?: string
}

/** Формула в строке текста (парная `$…$`). */
const FORMULA = /\$[^$\n]+\$/g

/**
 * Разбор куска строки: обычные символы (разметка снята), число законченных
 * формул и признак «кусок обрывается внутри формулы» — то есть каретка в ней.
 */
export function scanText(src: string): TextPos {
  let plain = 0
  let formulas = 0
  let last = 0
  FORMULA.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = FORMULA.exec(src))) {
    plain += visibleText(src.slice(last, m.index)).length
    formulas++
    last = m.index + m[0].length
  }
  const tail = src.slice(last)
  const open = tail.indexOf('$')
  if (open >= 0) {
    // Незакрытая «$» — каретка стоит внутри этой формулы.
    return {
      plain: plain + visibleText(tail.slice(0, open)).length,
      formulas,
      inFormula: true,
      math: tail.slice(open + 1),
    }
  }
  return { plain: plain + visibleText(tail).length, formulas, inFormula: false }
}

/**
 * Позиция каретки в тексте блока, который начинается со строки blockLine.
 * Строки внутри блока разделены <br> — это НЕ символ текста, поэтому
 * предыдущие строки добавляют только свою длину (в листинге иначе: там строки
 * склеены настоящим переносом, см. codeTextOffset).
 */
export function textPosAt(
  lines: string[],
  blockLine: number,
  caretLine: number,
  column: number,
): TextPos {
  let plain = 0
  let formulas = 0
  for (let i = Math.max(0, blockLine); i < caretLine && i < lines.length; i++) {
    // Парсер кладёт в блок строки уже обрезанными по краям.
    const r = scanText(lines[i].slice(lineMarkerLength(lines[i])).trim())
    plain += r.plain
    formulas += r.formulas
  }
  const raw = lines[caretLine] ?? ''
  const cut = lineMarkerLength(raw)
  const r = scanText(raw.slice(cut, Math.max(cut, column)))
  return {
    plain: plain + r.plain,
    formulas: formulas + r.formulas,
    inFormula: r.inFormula,
    math: r.math,
  }
}

/** Смещение каретки в обычных символах от начала блока (без учёта формул). */
export function caretTextOffset(
  lines: string[],
  blockLine: number,
  caretLine: number,
  column: number,
): number {
  return textPosAt(lines, blockLine, caretLine, column).plain
}

/**
 * Смещение каретки в тексте листинга. Текст листинга — строки между
 * ограждениями ```, склеенные переносами и БЕЗ снятия разметки: код выводится
 * буквально, поэтому считаются исходные длины.
 */
export function codeTextOffset(
  lines: string[],
  fenceLine: number,
  caretLine: number,
  column: number,
): number {
  if (caretLine <= fenceLine) return 0
  let off = 0
  for (let i = fenceLine + 1; i < caretLine && i < lines.length; i++) {
    off += lines[i].length + 1
  }
  const raw = lines[caretLine] ?? ''
  return off + Math.max(0, Math.min(column, raw.length))
}

/**
 * Ячейка строки таблицы, в которой стоит каретка, и кусок её исходного текста
 * до каретки. Исходная строка — «| A | B |»: столбцы разделены «|», содержимое
 * ячейки в выводе обрезано по краям, поэтому ведущие пробелы отбрасываются.
 */
export function cellAt(raw: string, col: number): { index: number; before: string } {
  let index = -1
  let start = 0
  for (let i = 0; i < raw.length && i < col; i++) {
    if (raw[i] === '|') {
      index++
      start = i + 1
    }
  }
  if (index < 0) return { index: 0, before: '' }
  const seg = raw.slice(start, Math.max(start, col))
  return { index, before: seg.trimStart() }
}

/** Скобки, в которые mermaid берёт подпись узла. */
const MERMAID_PAIRS: Record<string, string> = { '[': ']', '(': ')', '{': '}' }

/**
 * Подпись узла/связи mermaid, внутри которой стоит каретка, и смещение в ней.
 * В исходнике схемы текст живёт в скобках (`A[Начало]`, `B((Конец))`), в
 * кавычках или между вертикальными чертами (подпись связи `-->|да|`); всё
 * остальное — синтаксис, которому в отрисованной схеме ничего не соответствует.
 */
export function mermaidLabelAt(raw: string, col: number): { text: string; offset: number } | null {
  const n = Math.max(0, Math.min(col, raw.length))

  // Ближайшая слева НЕзакрытая скобка — открывающая для текущей подписи.
  let open = -1
  let closed = 0
  for (let i = n - 1; i >= 0; i--) {
    const c = raw[i]
    if (c === ']' || c === ')' || c === '}') closed++
    else if (MERMAID_PAIRS[c]) {
      if (closed === 0) {
        open = i
        break
      }
      closed--
    }
  }
  if (open >= 0) {
    const close = raw.indexOf(MERMAID_PAIRS[raw[open]], n)
    return slice(raw, open + 1, close < 0 ? raw.length : close, n)
  }

  // Кавычки и вертикальные черты: пара одинаковых символов — считаем чётность.
  for (const q of ['"', '|']) {
    let count = 0
    for (let i = 0; i < n; i++) if (raw[i] === q) count++
    if (count % 2 === 1) {
      const from = raw.lastIndexOf(q, n - 1) + 1
      const to = raw.indexOf(q, n)
      return slice(raw, from, to < 0 ? raw.length : to, n)
    }
  }
  return null
}

/** Кусок строки как подпись: обрезанный по краям текст и смещение каретки в нём. */
function slice(raw: string, from: number, to: number, col: number): { text: string; offset: number } | null {
  const body = raw.slice(from, to)
  const lead = body.length - body.trimStart().length
  const text = body.trim()
  if (!text) return null
  return { text, offset: Math.max(0, Math.min(col - from - lead, text.length)) }
}

/**
 * Команды LaTeX, которые сами глифа не дают: оформление, обёртки шрифта,
 * дроби и линии (рисуются линейкой, а не символом) и пробельные команды.
 */
const MATH_WRAPPERS = new Set([
  'mathbf', 'mathrm', 'mathit', 'mathsf', 'mathtt', 'mathcal', 'mathbb', 'mathfrak',
  'boldsymbol', 'bm', 'text', 'textbf', 'textit', 'mbox', 'operatorname',
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg',
  'frac', 'dfrac', 'tfrac', 'cfrac', 'binom', 'overline', 'underline',
  'begin', 'end', 'limits', 'nolimits', 'substack',
  'displaystyle', 'textstyle', 'scriptstyle', 'scriptscriptstyle',
  'quad', 'qquad', 'thinspace', 'enspace', 'nobreakspace',
])

/**
 * Сколько ВИДИМЫХ символов даёт кусок LaTeX. Нужно, чтобы попасть кареткой
 * внутрь большой формулы: посимвольного соответствия с исходником у KaTeX нет,
 * но порядок глифов в выводе совпадает с порядком в исходнике, поэтому каретка
 * адресуется номером глифа.
 *
 * Точность приблизительная у диакритики: `\hat{x}` выводится как «x» плюс знак
 * ударения ПОСЛЕ базы, а в исходнике команда стоит до неё — внутри такой группы
 * каретка может сместиться на один символ.
 */
export function mathGlyphs(latex: string): number {
  let n = 0
  for (let i = 0; i < latex.length; i++) {
    const c = latex[i]
    if (c === '\\') {
      const word = /^[a-zA-Z]+/.exec(latex.slice(i + 1))
      if (!word) {
        // «\{», «\}», «\|» рисуют скобку; «\,», «\;», «\!», «\\» — оформление.
        const sym = latex[i + 1]
        if (sym === '{' || sym === '}' || sym === '|') n++
        i++
        continue
      }
      const name = word[0]
      i += name.length
      if (name === 'begin' || name === 'end') {
        // Имя окружения — не текст формулы.
        const arg = /^\s*\{[^}]*\}/.exec(latex.slice(i + 1))
        if (arg) i += arg[0].length
        continue
      }
      if (!MATH_WRAPPERS.has(name)) n++
      continue
    }
    // Скобки группировки, индексы и пробелы глифов не дают.
    if (c === '{' || c === '}' || c === '_' || c === '^' || c === '&' || /\s/.test(c)) continue
    n++
  }
  return n
}

/** Кусок LaTeX выключной формулы до каретки (ограждения `$$` отброшены). */
export function mathPrefix(
  lines: string[],
  blockLine: number,
  caretLine: number,
  column: number,
): string {
  let out = ''
  for (let i = Math.max(0, blockLine); i <= caretLine && i < lines.length; i++) {
    let part = lines[i]
    if (i === caretLine) part = part.slice(0, Math.max(0, column))
    if (i === blockLine) part = part.replace(/^\s*\$\$/, '')
    out += (i > blockLine ? '\n' : '') + part
  }
  return out.replace(/\$\$\s*$/, '')
}
