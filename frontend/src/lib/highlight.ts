import { esc } from './markdown'
import type { Settings } from './settings'

// --- Метрики текстового слоя редактора ---
// Ими одинаково пользуются оба слоя (textarea и подсвеченный pre, инвариант
// «переносят строки одинаково») и синхронная прокрутка, которая по этой сетке
// переводит scrollTop в номер строки. Расходиться им нельзя.

/** Моноширинный шрифт редактора. */
export const EDITOR_FONT = "'JetBrains Mono',ui-monospace,Menlo,monospace"

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
  // Токены кода внутри ```-блоков (ключевые слова, строки, числа, комментарии).
  codeKw: string
  codeStr: string
  codeNum: string
  codeCom: string
}

export function edColors(theme: Settings['theme']): EditorColors {
  if (theme === 'dark')
    return {
      bg: '#201f1c',
      text: '#e9e6dc',
      dim: '#5f5b4e',
      head: '#117dff',
      chipBg: '#2e2c26',
      fence: '#9d977f',
      link: '#82aacb',
      math: '#b39ddb',
      mark: '#117dff',
      quote: '#8f8a76',
      caption: '#86a87c',
      gutBorder: '#2e2c26',
      codeKw: '#b39ddb',
      codeStr: '#86a87c',
      codeNum: '#82aacb',
      codeCom: '#716c5c',
    }
  return {
    bg: '#fffefb',
    text: '#3a3630',
    dim: '#b8b2a0',
    head: '#117dff',
    chipBg: '#f1eee4',
    fence: '#7a7563',
    link: '#3e6b8f',
    math: '#7c5cbf',
    mark: '#117dff',
    quote: '#8a8470',
    caption: '#5d8a52',
    gutBorder: '#f0eee6',
    codeKw: '#7c5cbf',
    codeStr: '#5d8a52',
    codeNum: '#3e6b8f',
    codeCom: '#a89f88',
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

/** Подсветка одной строки кода: собираем совпадения всех типов токенов по
 *  сырой строке, отбрасываем пересечения (комментарий «съедает» строку внутри,
 *  строка — ключевое слово и т. д.) и склеиваем html слева направо. Каждый
 *  кусок экранируется отдельно; меняется, как и везде в подсветке, ТОЛЬКО цвет. */
function hlCode(raw: string, rules: CodeRules, C: EditorColors): string {
  const matches: { s: number; e: number; color: string }[] = []
  const collect = (re: RegExp, color: string) => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    let m: RegExpExecArray | null
    while ((m = g.exec(raw))) {
      if (m[0] === '') break
      matches.push({ s: m.index, e: m.index + m[0].length, color })
    }
  }
  if (rules.comment) collect(rules.comment, C.codeCom)
  // Строки в одинарных/двойных кавычках и бэктиках (с учётом \-экранирования).
  collect(/(["'`])(?:\\.|(?!\1).)*\1/g, C.codeStr)
  collect(/\b\d+(?:\.\d+)?\b/g, C.codeNum)
  if (rules.kw) collect(rules.kw, C.codeKw)

  // Ранний токен главнее; при равном старте — более длинный.
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
    stash('<span style="background:' + C.chipBg + ';border-radius:3px">`' + c + '`</span>'),
  )
  t = t.replace(/\$([^$\n]+)\$/g, (_, c) => stash('<span style="color:' + C.math + '">$' + c + '$</span>'))
  t = t.replace(/\*\*([^*]+)\*\*/g, (_, c) =>
    stash(
      '<span style="color:' + C.dim + '">**</span><span style="color:' + C.mark + '">' + c +
        '</span><span style="color:' + C.dim + '">**</span>',
    ),
  )
  t = t.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_, a, u) =>
    stash(
      '<span style="color:' + C.mark + '">![' + a + ']</span><span style="color:' + C.dim + '">(' + u + ')</span>',
    ),
  )
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, a, u) =>
    stash(
      '<span style="color:' + C.link + '">[' + a + ']</span><span style="color:' + C.dim + '">(' + u + ')</span>',
    ),
  )
  t = t.replace(/\*([^*]+)\*/g, (_, c) =>
    stash(
      '<span style="color:' + C.dim + '">*</span><span style="color:' + C.link + '">' + c +
        '</span><span style="color:' + C.dim + '">*</span>',
    ),
  )
  t = t.replace(/\u0001(\d+)\u0001/g, (_, n) => ph[+n])
  return t
}

export function highlight(md: string, C: EditorColors): string {
  const lines = md.split('\n')
  let inF = false
  let rules: CodeRules = { comment: null, kw: null }
  const out = lines.map((line) => {
    const e = esc(line)
    const t = line.trim()
    if (/^```/.test(t)) {
      inF = !inF
      if (inF) rules = codeRules(t.slice(3).trim())
      return '<span style="color:' + C.fence + '">' + e + '</span>'
    }
    if (inF) return hlCode(line, rules, C)
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{1,3})(\s+)(.*)$/))) {
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
    if (t.startsWith('$$')) return '<span style="color:' + C.math + '">' + e + '</span>'
    if (t.startsWith('>')) return '<span style="color:' + C.quote + '">' + e + '</span>'
    if ((m = line.match(/^(\s*)([-*]|\d+[.)])(\s+)(.*)$/))) {
      return (
        m[1] + '<span style="color:' + C.mark + '">' + m[2] + '</span>' + m[3] +
        hlInline(esc(m[4]), C)
      )
    }
    return hlInline(e, C)
  })
  return out.join('\n')
}
