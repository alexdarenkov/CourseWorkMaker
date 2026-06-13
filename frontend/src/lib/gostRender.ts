import { getAsset, getImageSize } from './assets'
import type { Settings } from './settings'
import { Block, esc, inline, isStructural, katexHtml } from './markdown'

// Максимальный размер иллюстрации — как в конвертере (gost.py): 150×180 мм.
const MAX_IMG_W_MM = 150
const MAX_IMG_H_MM = 180

function fitMm(wPx: number, hPx: number): { w: number; h: number } {
  const w0 = (wPx / 96) * 25.4
  const h0 = (hPx / 96) * 25.4
  const k = Math.min(MAX_IMG_W_MM / w0, MAX_IMG_H_MM / h0, 1)
  return { w: w0 * k, h: h0 * k }
}

/** Вписывает mermaid-SVG в страницу по его viewBox (как PNG в DOCX). */
function fitSvg(svg: string): string {
  if (!svg.includes('<svg')) return svg
  const m = /viewBox="([^"]+)"/.exec(svg)
  let w = 800
  let h = 450
  if (m) {
    const p = m[1].trim().split(/[\s,]+/).map(Number)
    if (p.length === 4 && p[2] > 0 && p[3] > 0) {
      w = p[2]
      h = p[3]
    }
  }
  const box = fitMm(w, h)
  const patched = svg.replace(/<svg([^>]*)>/, (_full, attrs: string) => {
    const a = attrs
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '')
      .replace(/max-width:\s*[^;"']+;?/, '')
    return `<svg width="100%" height="100%"${a}>`
  })
  return `<div style="width:${box.w.toFixed(1)}mm;height:${box.h.toFixed(1)}mm">${patched}</div>`
}

export interface HeadingRec {
  label: string
  level: number
  page: number
}

export interface RenderedBlock {
  html: string
  breakBefore?: boolean
  isHeading?: boolean
  rec?: HeadingRec
}

export interface RenderContext {
  fig: number
  tab: number
  form: number
  headings: HeadingRec[]
}

/**
 * Преобразует блоки markdown в HTML-фрагменты, оформленные по ГОСТ 7.32-2017.
 * mermaidHtml(code) возвращает SVG из кэша или null (тогда рисуется заглушка).
 */
export function renderAll(
  blocks: Block[],
  s: Settings,
  mermaidHtml: (code: string) => string | null,
  onAssetReady: () => void = () => {},
): { out: RenderedBlock[]; ctx: RenderContext } {
  const ctx = { sec: 0, sub: 0, sub2: 0, fig: 0, tab: 0, form: 0, headings: [] as HeadingRec[], inBib: false }
  const out: RenderedBlock[] = []
  const P = (html: string, extra?: Partial<RenderedBlock>) => out.push({ html, ...extra })

  for (const b of blocks) {
    if (b.type === 'h1') {
      const txt = b.text.trim()
      if (isStructural(txt)) {
        ctx.inBib = /^список/i.test(txt)
        const rec: HeadingRec = { label: txt.toUpperCase(), level: 1, page: 0 }
        ctx.headings.push(rec)
        P(
          '<div style="text-align:center;font-weight:bold;padding:0 0 8mm">' +
            inline(txt.toUpperCase()) +
            '</div>',
          { breakBefore: true, isHeading: true, rec },
        )
      } else {
        ctx.sec++
        ctx.sub = 0
        ctx.sub2 = 0
        ctx.inBib = false
        const rec: HeadingRec = { label: ctx.sec + ' ' + txt, level: 1, page: 0 }
        ctx.headings.push(rec)
        P(
          '<div style="font-weight:bold;text-indent:12.5mm;padding:0 0 8mm">' +
            ctx.sec +
            '&nbsp;' +
            inline(b.text) +
            '</div>',
          { breakBefore: true, isHeading: true, rec },
        )
      }
    } else if (b.type === 'h2') {
      ctx.sub++
      ctx.sub2 = 0
      const num = ctx.sec + '.' + ctx.sub
      const rec: HeadingRec = { label: num + ' ' + b.text.trim(), level: 2, page: 0 }
      ctx.headings.push(rec)
      P(
        '<div style="font-weight:bold;text-indent:12.5mm;padding:5mm 0 5mm">' +
          num +
          '&nbsp;' +
          inline(b.text) +
          '</div>',
        { isHeading: true, rec },
      )
    } else if (b.type === 'h3') {
      ctx.sub2++
      const num = ctx.sec + '.' + ctx.sub + '.' + ctx.sub2
      const rec: HeadingRec = { label: num + ' ' + b.text.trim(), level: 3, page: 0 }
      ctx.headings.push(rec)
      P(
        '<div style="font-weight:bold;text-indent:12.5mm;padding:4mm 0 4mm">' +
          num +
          '&nbsp;' +
          inline(b.text) +
          '</div>',
        { isHeading: true, rec },
      )
    } else if (b.type === 'p') {
      P('<div style="text-align:justify;text-indent:12.5mm">' + inline(b.text) + '</div>')
    } else if (b.type === 'ul' || b.type === 'ol') {
      b.items.forEach((it, n) => {
        let marker = '– '
        if (b.type === 'ol') marker = n + 1 + ') '
        if (ctx.inBib && s.bibliography) marker = n + 1 + '. '
        P('<div style="text-align:justify;text-indent:12.5mm">' + marker + inline(it) + '</div>')
      })
    } else if (b.type === 'figure') {
      ctx.fig++
      const cap = b.caption || b.alt || ''
      const resolved = b.src?.startsWith('asset:') ? getAsset(b.src) : b.src
      const isReal = /^(https?:\/\/|data:image\/)/.test(resolved || '')
      const placeholder =
        '<div style="width:125mm;height:62mm;border:1px solid #000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm;color:#666;font-size:11pt"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"></path></svg><span>Место для изображения</span></div>'
      let inner = placeholder
      if (isReal) {
        // Размер берём из кэша: блок обязан иметь точную высоту уже при
        // пагинации, иначе подгрузившаяся картинка налезет на номер страницы.
        const dim = getImageSize(resolved!, onAssetReady)
        if (dim === null) {
          inner =
            '<div style="width:125mm;height:62mm;border:1px dashed #999;display:flex;align-items:center;justify-content:center;color:#888;font-size:11pt">Загрузка изображения…</div>'
        } else if (dim.w > 0 && dim.h > 0) {
          const box = fitMm(dim.w, dim.h)
          inner =
            '<img src="' + esc(resolved!) + '" style="width:' + box.w.toFixed(1) + 'mm;height:' + box.h.toFixed(1) + 'mm" alt="">'
        }
      }
      const capTxt = s.autoNumber ? 'Рисунок ' + ctx.fig + ' — ' + inline(cap) : inline(cap)
      P(
        '<div style="padding:4mm 0;text-align:center"><div style="display:flex;justify-content:center">' +
          inner +
          '</div><div style="padding-top:3mm">' +
          capTxt +
          '</div></div>',
      )
    } else if (b.type === 'mermaid') {
      ctx.fig++
      const cap = b.caption || 'Схема'
      const svg = mermaidHtml(b.code)
      const body = svg
        ? '<div style="display:flex;justify-content:center;max-width:100%;overflow:hidden">' + fitSvg(svg) + '</div>'
        : '<div style="width:125mm;height:50mm;border:1px dashed #999;display:flex;align-items:center;justify-content:center;color:#888;font-size:11pt">Построение схемы…</div>'
      const capTxt = s.autoNumber ? 'Рисунок ' + ctx.fig + ' — ' + inline(cap) : inline(cap)
      P(
        '<div style="padding:4mm 0;text-align:center"><div style="display:flex;justify-content:center">' +
          body +
          '</div><div style="padding-top:3mm">' +
          capTxt +
          '</div></div>',
      )
    } else if (b.type === 'table') {
      ctx.tab++
      const cap = b.caption
        ? 'Таблица ' + ctx.tab + ' — ' + inline(b.caption)
        : s.autoNumber
          ? 'Таблица ' + ctx.tab
          : ''
      const head = b.rows[0] || []
      const body = b.rows.slice(1)
      let html = '<div style="padding:4mm 0">'
      if (cap) html += '<div style="padding-bottom:2mm">' + cap + '</div>'
      html +=
        '<table style="border-collapse:collapse;width:100%;font-size:12pt;line-height:1.2"><thead><tr>' +
        head
          .map(
            (c) =>
              '<th style="border:1px solid #000;padding:1.5mm 2mm;font-weight:bold;text-align:center">' +
              inline(c) +
              '</th>',
          )
          .join('') +
        '</tr></thead><tbody>' +
        body
          .map(
            (r) =>
              '<tr>' +
              r
                .map(
                  (c) =>
                    '<td style="border:1px solid #000;padding:1.5mm 2mm;vertical-align:top">' +
                    inline(c) +
                    '</td>',
                )
                .join('') +
              '</tr>',
          )
          .join('') +
        '</tbody></table></div>'
      P(html)
    } else if (b.type === 'code') {
      P(
        '<div style="padding:3mm 0"><div style="border:1px solid #000;padding:3mm 4mm;font-family:\'Courier New\',Courier,monospace;font-size:12pt;line-height:1.25;white-space:pre-wrap;word-break:break-word;text-align:left">' +
          esc(b.code) +
          '</div></div>',
      )
    } else if (b.type === 'math') {
      ctx.form++
      const k = katexHtml(b.code, true)
      const numHtml = s.autoNumber
        ? '<div style="width:15mm;text-align:right;flex-shrink:0">(' +
          ctx.form +
          ')</div><div style="width:15mm;flex-shrink:0;order:-1"></div>'
        : ''
      P(
        '<div style="padding:3mm 0;display:flex;align-items:center"><div style="flex:1;text-align:center;overflow:hidden">' +
          k +
          '</div>' +
          numHtml +
          '</div>',
      )
    } else if (b.type === 'quote') {
      P('<div style="padding:2mm 0 2mm 12.5mm;font-style:italic">' + inline(b.text) + '</div>')
    } else if (b.type === 'hr') {
      P('<div style="height:7mm"></div>')
    }
  }
  return { out, ctx: { fig: ctx.fig, tab: ctx.tab, form: ctx.form, headings: ctx.headings } }
}

export function buildTitle(S: Settings): string {
  const u = esc
  return (
    '<div style="display:flex;flex-direction:column;height:257mm;text-align:center">' +
    '<div style="font-size:12pt;line-height:1.4">МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ</div>' +
    '<div style="font-size:12pt;padding-top:3mm;line-height:1.4">Федеральное государственное бюджетное образовательное учреждение высшего образования</div>' +
    '<div style="font-size:13pt;font-weight:bold;padding-top:2mm;line-height:1.4">' +
    u(S.university).toUpperCase() +
    '</div>' +
    '<div style="font-size:12pt;padding-top:3mm">' +
    u(S.department) +
    '</div>' +
    '<div style="flex:1.2"></div>' +
    '<div style="font-size:18pt;font-weight:bold;letter-spacing:.06em">КУРСОВАЯ РАБОТА</div>' +
    '<div style="padding-top:5mm">по дисциплине «' +
    u(S.discipline) +
    '»</div>' +
    '<div style="padding-top:2mm">на тему: «<b>' +
    u(S.topic) +
    '</b>»</div>' +
    '<div style="flex:1.4"></div>' +
    '<div style="text-align:left;margin-left:52%;line-height:1.6;font-size:13pt">Выполнил:<br>студент группы ' +
    u(S.group) +
    '<br>' +
    u(S.student) +
    '<br><br>Руководитель:<br>' +
    u(S.supervisor) +
    '</div>' +
    '<div style="flex:1.2"></div>' +
    '<div style="font-size:13pt;line-height:1.5">' +
    u(S.city) +
    '<br>' +
    u(S.year) +
    '</div>' +
    '</div>'
  )
}

export function buildToc(headings: HeadingRec[]): string[] {
  const rows = headings.map((h) => {
    const ind = h.level === 1 ? 0 : h.level === 2 ? 8 : 16
    return (
      '<div style="display:flex;align-items:baseline;padding-left:' +
      ind +
      'mm;line-height:1.6">' +
      '<span style="max-width:118mm">' +
      esc(h.label) +
      '</span>' +
      '<span style="flex:1;min-width:6mm;border-bottom:1pt dotted #000;margin:0 1.5mm;transform:translateY(-4px)"></span>' +
      '<span>' +
      (h.page || '') +
      '</span></div>'
    )
  })
  const pages: string[] = []
  let first = true
  do {
    const take = rows.splice(0, first ? 26 : 30)
    pages.push(
      (first
        ? '<div style="text-align:center;font-weight:bold;padding:0 0 8mm">СОДЕРЖАНИЕ</div>'
        : '') + take.join(''),
    )
    first = false
  } while (rows.length)
  return pages
}

export function estTocPages(n: number): number {
  return n <= 26 ? 1 : 1 + Math.ceil((n - 26) / 30)
}
