import { esc } from './markdown'
import type { Settings } from './settings'

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
}

export function edColors(theme: Settings['theme']): EditorColors {
  if (theme === 'dark')
    return {
      bg: '#201f1c',
      text: '#e9e6dc',
      dim: '#5f5b4e',
      head: '#e08a68',
      chipBg: '#2e2c26',
      fence: '#9d977f',
      link: '#82aacb',
      math: '#b39ddb',
      mark: '#e08a68',
      quote: '#8f8a76',
      caption: '#86a87c',
      gutBorder: '#2e2c26',
    }
  return {
    bg: '#fffefb',
    text: '#3a3630',
    dim: '#b8b2a0',
    head: '#c25e3d',
    chipBg: '#f1eee4',
    fence: '#7a7563',
    link: '#3e6b8f',
    math: '#7c5cbf',
    mark: '#c25e3d',
    quote: '#8a8470',
    caption: '#5d8a52',
    gutBorder: '#f0eee6',
  }
}

function hlInline(t: string, C: EditorColors): string {
  const ph: string[] = []
  const stash = (html: string) => {
    ph.push(html)
    return '\u0001' + (ph.length - 1) + '\u0001'
  }
  t = t.replace(/`([^`]+)`/g, (_, c) =>
    stash('<span style="background:' + C.chipBg + ';border-radius:3px;padding:0 3px">`' + c + '`</span>'),
  )
  t = t.replace(/\$([^$\n]+)\$/g, (_, c) => stash('<span style="color:' + C.math + '">$' + c + '$</span>'))
  t = t.replace(/\*\*([^*]+)\*\*/g, (_, c) =>
    stash(
      '<b><span style="color:' + C.dim + '">**</span>' + c + '<span style="color:' + C.dim + '">**</span></b>',
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
    stash('<i><span style="color:' + C.dim + '">*</span>' + c + '<span style="color:' + C.dim + '">*</span></i>'),
  )
  t = t.replace(/\u0001(\d+)\u0001/g, (_, n) => ph[+n])
  return t
}

export function highlight(md: string, C: EditorColors): string {
  const lines = md.split('\n')
  let inF = false
  const out = lines.map((line) => {
    const e = esc(line)
    const t = line.trim()
    if (/^```/.test(t)) {
      inF = !inF
      return '<span style="color:' + C.fence + ';font-weight:600">' + e + '</span>'
    }
    if (inF) return '<span style="color:' + C.fence + '">' + e + '</span>'
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{1,3})(\s+)(.*)$/))) {
      return (
        '<span style="color:' + C.dim + '">' + m[1] + '</span>' + m[2] +
        '<b style="color:' + C.head + '">' + hlInline(esc(m[3]), C) + '</b>'
      )
    }
    if (/^(Рисунок|Таблица):/i.test(t)) {
      const idx = line.indexOf(':')
      return (
        '<span style="color:' + C.caption + ';font-weight:600">' + esc(line.slice(0, idx + 1)) + '</span>' +
        hlInline(esc(line.slice(idx + 1)), C)
      )
    }
    if (t.startsWith('$$')) return '<span style="color:' + C.math + '">' + e + '</span>'
    if (t.startsWith('>')) return '<i style="color:' + C.quote + '">' + e + '</i>'
    if ((m = line.match(/^(\s*)([-*]|\d+[.)])(\s+)(.*)$/))) {
      return (
        m[1] + '<span style="color:' + C.mark + ';font-weight:600">' + m[2] + '</span>' + m[3] +
        hlInline(esc(m[4]), C)
      )
    }
    return hlInline(e, C)
  })
  return out.join('\n')
}
