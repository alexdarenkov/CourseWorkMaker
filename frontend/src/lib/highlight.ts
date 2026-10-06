import { esc } from './markdown'
import type { Settings } from './settings'

// --- Метрики текстового слоя редактора ---
// Ими одинаково пользуются оба слоя (textarea и подсвеченный pre, инвариант
// «переносят строки одинаково») и синхронная прокрутка, которая по этой сетке
// переводит scrollTop в номер строки. Расходиться им нельзя.

/** Моноширинный шрифт редактора. */
export const EDITOR_FONT = 'var(--font-mono)'

/** Внутренние отступы текстового слоя, px. */
export const EDITOR_PAD_TOP = 18
export const EDITOR_PAD_X = 22
export const EDITOR_PAD_BOTTOM = 140

/**
 * Высота строки редактора — ЦЕЛОЕ число px (а не дробный множитель 1.65):
 * дробный line-height браузеры округляют по-разному в textarea, pre и
 * нумерации, из-за чего слои накапливают вертикальное расхождение — номера
 * «съезжают» от строк, а каретка встаёт выше своей строки.
 */
export function editorLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.65)
}

export interface EditorColors {
  bg: string
  text: string
  dim: string
  head: string
  chipBg: string
  fence: string
  link: string
  math: string
  mark: string
  quote: string
  caption: string
  gutBorder: string
  // Фон рамки вокруг ```-блоков (код и mermaid).
  codeBg: string
  // Токены кода внутри ```-блоков (ключевые слова, строки, числа, комментарии,
  // вызовы функций).
  codeKw: string
  codeStr: string
  codeNum: string
  codeCom: string
  codeFn: string
  // Inline-оформление: у каждого вида выделения свой цвет.
  bold: string
  italic: string
  code: string
  image: string
  table: string
  // Токены внутри ```mermaid: ключевые слова, стрелки, подписи узлов и рёбер.
  mmKw: string
  mmArrow: string
  mmLabel: string
}

/* Цвета терминальной (ANSI) палитры без зелёного; синий — прежний акцент
 * Texturn (#117dff), нейтральные цвета светлой темы — между тёплыми
 * и холодными (styles/tokens.css). Роли: заголовки/маркеры/картинки — синий, жирный —
 * пурпурный, курсив и формулы — голубой, inline-код — жёлтый, ссылки и
 * подписи — циан, строки в коде и подписи узлов Mermaid — красный. */
const ANSI = {
  light: {
    blue: '#117dff',
    sky: '#5197db',
    cyan: '#68b896',
    magenta: '#9877c2',
    red: '#db7371',
    yellow: '#e2ac57',
  },
  dark: {
    blue: '#117dff',
    sky: '#70bbf5',
    cyan: '#a3dfc8',
    magenta: '#c6a3f4',
    red: '#db7376',
    yellow: '#eeb261',
  },
}

export function edColors(theme: Settings['theme']): EditorColors {
  const dark = theme === 'dark'
  const A = dark ? ANSI.dark : ANSI.light
  const base = dark
    ? {
        bg: '#0f1217',
        text: '#d2d0ca',
        dim: '#525354',
        chipBg: '#1f232a',
        fence: '#8a8c90',
        quote: '#8a8c90',
        gutBorder: '#1f232a',
        codeBg: '#161a20',
        codeCom: '#5f6166',
      }
    : {
        bg: '#fffefd',
        text: '#3c3c36',
        dim: '#b5b3ac',
        chipBg: '#f0efeb',
        fence: '#7c7b75',
        quote: '#84827c',
        gutBorder: '#ebebe8',
        codeBg: '#f2f2ee',
        codeCom: '#a2a099',
      }
  return {
    ...base,
    head: A.blue,
    mark: A.blue,
    link: A.cyan,
    math: A.sky,
    caption: A.cyan,
    bold: A.magenta,
    italic: A.sky,
    code: A.yellow,
    image: A.blue,
    table: A.sky,
    codeKw: A.magenta,
    codeStr: A.red,
    codeNum: A.cyan,
    codeFn: A.blue,
    mmKw: A.blue,
    mmArrow: A.sky,
    mmLabel: A.red,
  }
}

/* ---------- подсветка кода внутри ```-блоков ---------- */

const KW = {
  python:
    'def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|lambda|pass|break|continue|raise|yield|global|nonlocal|assert|del|not|and|or|in|is|None|True|False|self',
  js: 'function|const|let|var|return|if|else|for|while|do|switch|case|default|class|extends|new|import|from|export|async|await|try|catch|finally|throw|this|typeof|instanceof|of|in|null|undefined|true|false|interface|type|enum',
  java: 'public|private|protected|static|final|void|int|long|double|float|boolean|char|byte|short|class|interface|extends|implements|new|return|if|else|for|while|do|switch|case|default|try|catch|finally|throw|throws|this|super|null|true|false|import|package|String|abstract|synchronized',
  sql: 'select|from|where|join|left|right|inner|outer|full|on|group|by|order|having|insert|into|values|update|set|delete|create|table|drop|alter|index|view|and|or|not|null|as|distinct|limit|offset|union|all|exists|between|like|in|is|primary|key|foreign|references|constraint|default|asc|desc',
  bash: 'if|then|else|elif|fi|for|do|done|while|until|case|esac|function|echo|exit|return|local|export|source',
  json: 'true|false|null',
}

interface CodeRules {
  comment: RegExp | null
  kw: RegExp | null
}

function codeRules(lang: string): CodeRules {
  const l = lang.toLowerCase()
  if (['python', 'py', 'matplotlib'].includes(l)) return { comment: /#.*$/, kw: kwRe(KW.python) }
  if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(l))
    return { comment: /\/\/.*$/, kw: kwRe(KW.js) }
  if (['java', 'kotlin', 'c', 'cpp', 'csharp', 'cs', 'go', 'rust'].includes(l))
    return { comment: /\/\/.*$/, kw: kwRe(KW.java) }
  if (l === 'sql') return { comment: /--.*$/, kw: new RegExp('\\b(?:' + KW.sql + ')\\b', 'gi') }
  if (['bash', 'sh', 'shell', 'zsh'].includes(l)) return { comment: /#.*$/, kw: kwRe(KW.bash) }
  if (l === 'json') return { comment: null, kw: kwRe(KW.json) }
  // Неизвестный язык: только строки и числа, без ключевых слов.
  return { comment: null, kw: null }
}

function kwRe(words: string): RegExp {
  return new RegExp('\\b(?:' + words + ')\\b', 'g')
}

type Token = { s: number; e: number; color: string }

/** Собирает все совпадения `re` в строке как токены одного цвета. */
function collect(raw: string, re: RegExp, color: string, out: Token[]): void {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m: RegExpExecArray | null
  while ((m = g.exec(raw))) {
    if (m[0] === '') break
    out.push({ s: m.index, e: m.index + m[0].length, color })
  }
}

/** Склеивает html строки из токенов: пересечения отбрасываются (ранний токен
 *  главнее, при равном старте — более длинный: комментарий «съедает» строку
 *  внутри, строка — ключевое слово и т. д.). Каждый кусок экранируется
 *  отдельно; меняется, как и везде в подсветке, ТОЛЬКО цвет. */
function paintTokens(raw: string, matches: Token[]): string {
  matches.sort((a, b) => a.s - b.s || b.e - a.e)
  const out: string[] = []
  let pos = 0
  for (const m of matches) {
    if (m.s < pos) continue // пересекается с уже принятым токеном
    out.push(esc(raw.slice(pos, m.s)))
    out.push('<span style="color:' + m.color + '">' + esc(raw.slice(m.s, m.e)) + '</span>')
    pos = m.e
  }
  out.push(esc(raw.slice(pos)))
  return out.join('')
}

/** Подсветка одной строки кода. */
function hlCode(raw: string, rules: CodeRules, C: EditorColors): string {
  const matches: Token[] = []
  if (rules.comment) collect(raw, rules.comment, C.codeCom, matches)
  // Строки в одинарных/двойных кавычках и бэктиках (с учётом \-экранирования).
  collect(raw, /(["'`])(?:\\.|(?!\1).)*\1/g, C.codeStr, matches)
  collect(raw, /\b\d+(?:\.\d+)?\b/g, C.codeNum, matches)
  if (rules.kw) collect(raw, rules.kw, C.codeKw, matches)
  // Вызов функции — идентификатор перед «(». При равном токене ключевое слово
  // собрано раньше и побеждает (сортировка стабильна): `if (` остаётся ключевым.
  collect(raw, /\b[A-Za-z_]\w*(?=\s*\()/g, C.codeFn, matches)
  return paintTokens(raw, matches)
}

const MERMAID_KW = new RegExp(
  '\\b(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph' +
    '|subgraph|end|direction|participant|actor|activate|deactivate|autonumber|note|over|loop|alt|else|opt|par|and|critical|break' +
    '|class|classDef|style|linkStyle|click|state|title|section|dateFormat|axisFormat|TD|TB|BT|LR|RL)\\b',
  'g',
)

/** Подсветка строки внутри ```mermaid: подписи в скобках/кавычках/|…|,
 *  стрелки рёбер, ключевые слова диаграмм и комментарии %%. */
function hlMermaid(raw: string, C: EditorColors): string {
  const matches: Token[] = []
  collect(raw, /%%.*$/, C.codeCom, matches)
  collect(raw, /"[^"]*"|\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\|[^|]*\|/g, C.mmLabel, matches)
  collect(raw, /<?[-=.]{2,}>{0,2}|-+>>?/g, C.mmArrow, matches)
  collect(raw, MERMAID_KW, C.mmKw, matches)
  return paintTokens(raw, matches)
}

function hlInline(t: string, C: EditorColors): string {
  const ph: string[] = []
  const stash = (html: string) => {
    ph.push(html)
    return '\u0001' + (ph.length - 1) + '\u0001'
  }
  // КРИТИЧНО: подсветка обязана сохранять метрики глифов (ширину и высоту строк)
  // ровно как у textarea, иначе слой `<pre>` и `<textarea>` переносят строки
  // по-разному, и ниже точки расхождения курсор/выделение/клик попадают мимо
  // видимого текста (особенно на больших документах). Поэтому НИКАКОГО
  // font-weight / font-style / font-size / padding — только цвет и фон.
  t = t.replace(/`([^`]+)`/g, (_, c) =>
    stash('<span style="color:' + C.code + ';background:' + C.chipBg + ';border-radius:3px">`' + c + '`</span>'),
  )
  t = t.replace(/\$([^$\n]+)\$/g, (_, c) =>
    stash('<span style="color:' + C.math + ';background:' + C.chipBg + ';border-radius:3px">$' + c + '$</span>'),
  )
  t = t.replace(/\*\*([^*]+)\*\*/g, (_, c) =>
    stash(
      '<span style="color:' + C.dim + '">**</span><span style="color:' + C.bold + '">' + c +
        '</span><span style="color:' + C.dim + '">**</span>',
    ),
  )
  t = t.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_, a, u) =>
    stash(
      '<span style="color:' + C.image + '">![' + a + ']</span><span style="color:' + C.dim + '">(' + u + ')</span>',
    ),
  )
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, a, u) =>
    stash(
      '<span style="color:' + C.link + '">[' + a + ']</span><span style="color:' + C.dim + '">(' + u + ')</span>',
    ),
  )
  t = t.replace(/\*([^*]+)\*/g, (_, c) =>
    stash(
      '<span style="color:' + C.dim + '">*</span><span style="color:' + C.italic + '">' + c +
        '</span><span style="color:' + C.dim + '">*</span>',
    ),
  )
  t = t.replace(/\u0001(\d+)\u0001/g, (_, n) => ph[+n])
  return t
}

/** Строка таблицы: `|` цветом таблицы, строка-разделитель `| --- |` приглушена,
 *  содержимое ячеек — обычная inline-подсветка. */
function hlTableRow(line: string, C: EditorColors): string {
  const pipe = '<span style="color:' + C.table + '">|</span>'
  if (/^\s*\|[\s:\-|]+\|?\s*$/.test(line))
    return line
      .split('|')
      .map((cell) => (cell ? '<span style="color:' + C.dim + '">' + esc(cell) + '</span>' : ''))
      .join(pipe)
  return line
    .split('|')
    .map((cell) => hlInline(esc(cell), C))
    .join(pipe)
}

/**
 * Подсветка markdown для overlay-слоя `<pre>` поверх textarea.
 *
 * Блоки ```…``` (код и mermaid) и формулы $$…$$ оборачиваются в рамку — `<span>` с
 * `display:block`, фоном и скруглением, БЕЗ padding/margin/border: блок
 * занимает ту же ширину, что и текст вокруг, поэтому строки переносятся так же,
 * как в textarea. Перевод строки после блока кладётся ВНУТРЬ рамки: завершающий
 * перевод строки блока не рисует пустой строки, а ведущий перевод строки после
 * блока нарисовал бы лишнюю. По той же причине вызывающий передаёт `md + '\n'`
 * (см. EditorPane), а не дописывает перевод строки после html.
 */
export function highlight(md: string, C: EditorColors): string {
  const lines = md.split('\n')
  let inF = false
  let inMermaid = false
  let inMath = false
  let rules: CodeRules = { comment: null, kw: null }
  const lineHtml = (line: string): string => {
    const e = esc(line)
    const t = line.trim()
    if (inMath) {
      // Многострочная формула закрывается первой строкой с `$$` (как в markdown.ts).
      if (line.includes('$$')) inMath = false
      return '<span style="color:' + C.math + '">' + e + '</span>'
    }
    if (/^```/.test(t)) {
      inF = !inF
      const lang = t.slice(3).trim()
      inMermaid = inF && lang.toLowerCase() === 'mermaid'
      if (inF) rules = codeRules(lang)
      if (inMermaid) {
        const at = line.indexOf('```') + 3
        return (
          '<span style="color:' + C.fence + '">' + esc(line.slice(0, at)) + '</span>' +
          '<span style="color:' + C.mmKw + '">' + esc(line.slice(at)) + '</span>'
        )
      }
      return '<span style="color:' + C.fence + '">' + e + '</span>'
    }
    if (inF) return inMermaid ? hlMermaid(line, C) : hlCode(line, rules, C)
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{1,6})(\s+)(.*)$/))) {
      return (
        '<span style="color:' + C.dim + '">' + m[1] + '</span>' + m[2] +
        '<span style="color:' + C.head + '">' + hlInline(esc(m[3]), C) + '</span>'
      )
    }
    if (/^(Рисунок|Таблица):/i.test(t)) {
      const idx = line.indexOf(':')
      return (
        '<span style="color:' + C.caption + '">' + esc(line.slice(0, idx + 1)) + '</span>' +
        hlInline(esc(line.slice(idx + 1)), C)
      )
    }
    if (t.startsWith('$$')) {
      // Однострочная `$$…$$` — только если после `$$` есть содержимое и закрывающие `$$`.
      if (!(t.length > 4 && t.endsWith('$$'))) inMath = true
      return '<span style="color:' + C.math + '">' + e + '</span>'
    }
    if (/^(---+|\*\*\*+)$/.test(t))
      // Разрыв страницы: приглушённый текст на плашке.
      return '<span style="color:' + C.fence + ';background:' + C.chipBg + ';border-radius:3px">' + e + '</span>'
    if (t.startsWith('|')) return hlTableRow(line, C)
    if (t.startsWith('>')) return '<span style="color:' + C.quote + '">' + e + '</span>'
    if ((m = line.match(/^(\s*)([-*]|\d+[.)]|[абвгдежиклмнпрстуфхцшщэюя]\))(\s+)(.*)$/))) {
      return (
        m[1] + '<span style="color:' + C.mark + '">' + m[2] + '</span>' + m[3] +
        hlInline(esc(m[4]), C)
      )
    }
    return hlInline(e, C)
  }

  const boxOpen = '<span style="display:block;background:' + C.codeBg + ';border-radius:6px">'
  let html = ''
  let boxed = false
  lines.forEach((line, i) => {
    const wasInF = inF
    const wasInMath = inMath
    const h = lineHtml(line)
    // Рамку получают блоки ```…``` и формулы $$…$$ (однострочные и многострочные).
    const mathStart = !wasInF && !wasInMath && line.trim().startsWith('$$')
    if ((!wasInF && inF) || mathStart) {
      html += boxOpen
      boxed = true
    }
    html += h
    if (i < lines.length - 1) html += '\n'
    const mathEnd = (wasInMath && !inMath) || (mathStart && !inMath)
    if (boxed && ((wasInF && !inF) || mathEnd)) {
      html += '</span>'
      boxed = false
    }
  })
  if (boxed) html += '</span>' // незакрытый блок — рамка до конца документа
  return html
}
