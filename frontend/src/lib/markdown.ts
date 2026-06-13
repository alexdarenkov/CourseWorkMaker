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
  t = esc(t)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  t = t.replace(/\*([^*]+)\*/g, '<i>$1</i>')
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span style="text-decoration:underline">$1</span>')
  t = t.replace(/\u0000(\d+)\u0000/g, (_, n) => ph[+n])
  return t
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
      i++
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
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) {
      blocks.push({ type: ('h' + m[1].length) as 'h1' | 'h2' | 'h3', text: m[2] })
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
      blocks.push({ type: 'hr' })
      i++
      continue
    }
    const buf = [t]
    i++
    while (i < lines.length) {
      const nt = lines[i].trim()
      if (
        !nt ||
        /^(#{1,3}\s|```|\$\$|\||[-*]\s|\d+[.)]\s|>|!\[|---)/.test(nt) ||
        /^(Рисунок|Таблица):/i.test(nt)
      )
        break
      buf.push(nt)
      i++
    }
    blocks.push({ type: 'p', text: buf.join(' ') })
  }
  return blocks
}

export function isStructural(txt: string): boolean {
  return /^(введение|заключение|список|содержание|реферат|определения|обозначения|сокращения|приложени)/i.test(
    txt.trim(),
  )
}
