import katex from 'katex'

export type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'mermaid'; code: string; caption: string | null }
  | { type: 'math'; code: string }
  | { type: 'figure'; alt: string; src: string; caption: string | null }
  | { type: 'table'; rows: string[][]; caption: string | null }
  | { type: 'quote'; text: string }
  | { type: 'pagebreak' }
  | { type: 'blank' }
  | { type: 'hr' }

export function esc(t: string): string {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function katexHtml(src: string, display: boolean): string {
  try {
    return katex.renderToString(src, { displayMode: display, throwOnError: false })
  } catch {
    return '<i>' + esc(src) + '</i>'
  }
}

/** Inline-разметка для DOCX-превью (Times, как в готовом документе). */
export function inline(text: string): string {
  const ph: string[] = []
  let t = String(text)
  t = t.replace(/`([^`]+)`/g, (_, c) => {
    ph.push(
      '<span style="font-family:\'Courier New\',Courier,monospace;font-size:13pt">' +
        esc(c) +
        '</span>',
    )
    return '\u0000' + (ph.length - 1) + '\u0000'
  })
  t = t.replace(/\$([^$\n]+)\$/g, (_, c) => {
    ph.push(katexHtml(c, false))
    return '\u0000' + (ph.length - 1) + '\u0000'
  })
  // Длинное тире «—» заменяем на среднее «–» (код и формулы уже вынесены выше).
  t = t.replace(/—/g, '–')
  t = esc(t)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  t = t.replace(/\*([^*]+)\*/g, '<i>$1</i>')
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span style="text-decoration:underline">$1</span>')
  t = t.replace(/\n/g, '<br>') // принудительный перенос строки (от «\» в исходнике)
  t = t.replace(/\u0000(\d+)\u0000/g, (_, n) => ph[+n])
  return t
}

/** Срезает ручной номер в начале заголовка («4.3 », «1.2.1 », «1. ») — нумерация
 *  проставляется автоматически, поэтому ручная привела бы к двойной. Хвостовая
 *  точка тоже срезается: в конце заголовка точка не ставится (ГОСТ 7.32). */
export function stripHeadingNumber(text: string): string {
  return text.replace(/^\s*\d+(?:\.\d+)*[.)]?\s+/, '').replace(/\s*\.$/, '')
}

// Заголовок «съедает» идущие сразу за ним пустые строки: между заголовком и
// текстом не должно быть лишнего пустого абзаца — вертикальный интервал задаёт
// стиль заголовка (space_after 21/14/12 пт), а не ручные переносы. Проверяем
// последний УЖЕ добавленный блок, поэтому подряд идущие blank'и после заголовка
// схлопываются все. Зеркалит _drop_blank_after_heading в
// services/converter/app/md_parser.py.
function dropBlankAfterHeading(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    const prev = out[out.length - 1]
    if (b.type === 'blank' && prev && (prev.type === 'h1' || prev.type === 'h2' || prev.type === 'h3')) {
      continue
    }
    out.push(b)
  }
  return out
}

export function parseMD(md: string): Block[] {
  const lines = md.split('\n')
  const blocks: Block[] = []
  let i = 0
  let pendingFig: string | null = null
  let pendingTab: string | null = null
  let m: RegExpMatchArray | null

  while (i < lines.length) {
    const t = lines[i].trim()
    if (!t) {
      // Пустые строки: каждая ЛИШНЯЯ (сверх одной, разделяющей абзацы) даёт
      // видимую пустую строку в выводе.
      let blanks = 0
      while (i < lines.length && !lines[i].trim()) {
        blanks++
        i++
      }
      for (let k = 0; k < blanks - 1; k++) blocks.push({ type: 'blank' })
      continue
    }
    if ((m = t.match(/^```(\S*)/))) {
      const lang = (m[1] || '').toLowerCase()
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++
      if (lang === 'mermaid') {
        blocks.push({ type: 'mermaid', code: buf.join('\n'), caption: pendingFig })
        pendingFig = null
      } else {
        blocks.push({ type: 'code', lang, code: buf.join('\n') })
      }
      continue
    }
    if (t.startsWith('$$')) {
      let content = t.slice(2)
      if (content.endsWith('$$') && content.length >= 2 && t.length > 4) {
        content = content.slice(0, -2)
        i++
      } else {
        const buf: string[] = []
        if (content) buf.push(content)
        i++
        while (i < lines.length && lines[i].indexOf('$$') < 0) {
          buf.push(lines[i])
          i++
        }
        if (i < lines.length) {
          const last = lines[i].trim()
          if (last !== '$$') buf.push(last.replace(/\$\$\s*$/, ''))
          i++
        }
        content = buf.join('\n')
      }
      blocks.push({ type: 'math', code: content.trim() })
      continue
    }
    if ((m = t.match(/^(#{1,6})\s+(.*)$/))) {
      // Уровни 4+ приводим к 3 (глубже ГОСТ не нумерует); ручные номера в
      // тексте срезаем — нумерация всегда автоматическая.
      const level = Math.min(3, m[1].length)
      blocks.push({ type: ('h' + level) as 'h1' | 'h2' | 'h3', text: stripHeadingNumber(m[2]) })
      i++
      continue
    }
    if ((m = t.match(/^!\[([^\]]*)\]\(([^)]*)\)$/))) {
      blocks.push({ type: 'figure', alt: m[1], src: m[2], caption: pendingFig })
      pendingFig = null
      i++
      continue
    }
    if ((m = t.match(/^Рисунок:\s*(.*)$/i))) {
      pendingFig = m[1]
      i++
      continue
    }
    if ((m = t.match(/^Таблица:\s*(.*)$/i))) {
      pendingTab = m[1]
      i++
      continue
    }
    if (t.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim())
        i++
      }
      const cells = rows
        .filter((r) => !/^\|[\s:\-|]+\|?$/.test(r))
        .map((r) =>
          r
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim()),
        )
      blocks.push({ type: 'table', rows: cells, caption: pendingTab })
      pendingTab = null
      continue
    }
    if (/^[-*]\s+/.test(t)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }
    if (/^\d+[.)]\s+/.test(t)) {
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }
    if (t.startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', text: buf.join(' ') })
      continue
    }
    if (/^(---+|\*\*\*+)$/.test(t)) {
      // «---» / «***» — разрыв страницы.
      blocks.push({ type: 'pagebreak' })
      i++
      continue
    }
    const buf = [t]
    i++
    while (i < lines.length) {
      const nt = lines[i].trim()
      if (
        !nt ||
        /^(#{1,6}\s|```|\$\$|\||[-*]\s|\d+[.)]\s|>|!\[|---)/.test(nt) ||
        /^(Рисунок|Таблица):/i.test(nt)
      )
        break
      buf.push(nt)
      i++
    }
    blocks.push({ type: 'p', text: joinPara(buf) })
  }
  return dropBlankAfterHeading(blocks)
}

/** Каждый перенос строки в редакторе = перенос строки в выводе (breaks:true).
 *  Пустая строка по-прежнему начинает новый абзац. Хвостовой «\» срезаем. */
function joinPara(lines: string[]): string {
  return lines.map((l) => (l.endsWith('\\') ? l.slice(0, -1).trimEnd() : l)).join('\n')
}

/** Пояснения к формуле «где A — …». Строки (по одному пояснению на строку, если
 *  разделены «;»), либо одной строкой; null — если это не блок пояснений
 *  (начинается с «где » и содержит тире). */
export function splitGde(text: string): string[] | null {
  const t = text.trim()
  if (!/^где\s/i.test(t) || !/[–—-]/.test(t)) return null
  if (t.includes(';')) {
    const parts = t
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length >= 2) return parts.map((p, i) => (i < parts.length - 1 ? p + ';' : p))
  }
  return [t]
}

export function isStructural(txt: string): boolean {
  return /^(введение|заключение|список|содержание|реферат|определения|обозначения|сокращения|приложени)/i.test(
    txt.trim(),
  )
}
