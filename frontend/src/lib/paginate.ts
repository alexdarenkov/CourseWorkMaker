import type { Settings } from './settings'
import { parseMD } from './markdown'
import { buildTitle, buildToc, estTocPages, renderAll } from './gostRender'

export interface Page {
  html: string
}

const PAGE_CONTENT_HEIGHT_PX = 971 // 257mm контентной области при 96dpi

let host: HTMLDivElement | null = null

function getHost(): HTMLDivElement {
  if (!host) {
    host = document.createElement('div')
    host.style.cssText =
      "position:absolute;left:-99999px;top:0;width:165mm;visibility:hidden;font-family:'Times New Roman',Times,serif;font-size:14pt;line-height:1.5;color:#000"
    document.body.appendChild(host)
  }
  return host
}

/** Разбивает документ на страницы А4, измеряя реальные высоты блоков. */
export function paginate(
  md: string,
  s: Settings,
  mermaidHtml: (code: string) => string | null,
  onAssetReady: () => void = () => {},
): Page[] {
  const blocks = parseMD(md)
  const { out, ctx } = renderAll(blocks, s, mermaidHtml, onAssetReady)
  const tocPages = s.toc ? estTocPages(ctx.headings.length) : 0
  const offset = (s.titlePage ? 1 : 0) + tocPages

  const el = getHost()
  el.innerHTML = out.map((b) => '<div>' + b.html + '</div>').join('')
  const kids = el.children
  const pagesB: string[][] = [[]]
  let y = 0
  const heightOf = (i: number) =>
    kids[i] ? (kids[i] as HTMLElement).offsetHeight : 24
  out.forEach((b, i) => {
    const hh = heightOf(i)
    const cur = pagesB[pagesB.length - 1]
    let br = false
    if (cur.length > 0) {
      if (b.breakBefore) br = true
      else if (y + hh > PAGE_CONTENT_HEIGHT_PX) br = true
      else if (b.isHeading) {
        // Заголовок не должен «висеть» один внизу страницы: держим его вместе
        // с началом следующего блока. Если они влезают вместе на страницу, но
        // не в остаток — переносим заголовок на новую страницу целиком.
        const nextHh = i + 1 < out.length ? heightOf(i + 1) : 0
        const together = hh + nextHh
        if (together <= PAGE_CONTENT_HEIGHT_PX) {
          if (y + together > PAGE_CONTENT_HEIGHT_PX) br = true
        } else if (y + hh + Math.min(nextHh, 70) > PAGE_CONTENT_HEIGHT_PX) {
          // Следующий блок крупнее страницы — оставляем хотя бы пару строк.
          br = true
        }
      }
    }
    if (br) {
      pagesB.push([])
      y = 0
    }
    pagesB[pagesB.length - 1].push(b.html)
    y += hh
    if (b.rec && !b.rec.page) b.rec.page = offset + pagesB.length
  })
  el.innerHTML = ''

  const all: { html: string; show: boolean }[] = []
  if (s.titlePage) all.push({ html: buildTitle(s), show: false })
  if (s.toc) buildToc(ctx.headings).forEach((h) => all.push({ html: h, show: true }))
  pagesB.forEach((arr) => all.push({ html: arr.join(''), show: true }))

  return all.map((p, i) => ({
    html:
      p.html +
      (p.show && s.pageNumbers
        ? '<div style="position:absolute;bottom:8mm;left:0;right:0;text-align:center;font-size:11pt">' +
          (i + 1) +
          '</div>'
        : ''),
  }))
}
