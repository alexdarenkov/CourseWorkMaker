import { getAsset } from './assets'
import type { Settings } from './settings'
import { parseMD } from './markdown'
import {
  buildTitle,
  buildTocRow,
  LINE_HEIGHT,
  renderAll,
  TOC_HEADER_HTML,
  type HeadingRec,
  type RenderedBlock,
} from './gostRender'

export interface Page {
  html: string
}

const PAGE_CONTENT_HEIGHT_PX = 971 // 257mm контентной области при 96dpi

// Допуск размещения служебной свободной строки на границе листа (~3 мм):
// дребезг высот Chrome↔Word — см. комментарий в layoutBlocks.
const BLANK_EDGE_TOL_PX = 12

// line-height — калиброванная высота строки Word (см. LINE_HEIGHT в
// gostRender.ts); обязана совпадать со стилями страницы превью
// (PreviewPane.pageStyle и PAGE_CSS в previewTest.ts).
const HOST_CSS =
  "position:absolute;left:-99999px;top:0;width:165mm;visibility:hidden;font-family:'Times New Roman',Times,serif;font-size:14pt;line-height:" +
  LINE_HEIGHT +
  ';color:#000'

let host: HTMLDivElement | null = null

function getHost(): HTMLDivElement {
  if (!host) {
    host = document.createElement('div')
    host.style.cssText = HOST_CSS
    document.body.appendChild(host)
  }
  return host
}

interface TableMetrics {
  capH: number
  headH: number
  rowH: number[]
}

/** Измеряет высоту подписи, шапки и каждой строки таблицы в отдельном хосте. */
function measureTable(t: NonNullable<RenderedBlock['table']>): TableMetrics {
  const m = document.createElement('div')
  m.style.cssText = HOST_CSS
  m.innerHTML =
    '<div>' + t.caption + t.openTag + t.headHtml + '<tbody>' + t.rows.join('') + '</tbody></table></div>'
  document.body.appendChild(m)
  const cap = t.caption ? (m.querySelector(':scope > div > div') as HTMLElement) : null
  const capH = cap ? cap.getBoundingClientRect().height : 0
  const headTr = m.querySelector('thead tr') as HTMLElement | null
  const headH = headTr ? headTr.getBoundingClientRect().height : 0
  const rowH = Array.from(m.querySelectorAll('tbody tr')).map((r) => (r as HTMLElement).getBoundingClientRect().height)
  document.body.removeChild(m)
  return { capH, headH, rowH }
}

/**
 * Измеряет высоту каждой строки делимого блока и постоянной «обвязки» (рамка и
 * отступы), чтобы пагинатор мог делить блок построчно между страницами.
 */
function measureSplit(sp: NonNullable<RenderedBlock['split']>): { lineH: number[]; chrome: number } {
  const m = document.createElement('div')
  m.style.cssText = HOST_CSS
  // Высота каждой строки по отдельности: те же шрифт/перенос и ширина переноса,
  // что и в реальном боксе (строка из нескольких визуальных строк замеряется
  // целиком). Первая строка может отличаться (красная строка абзаца).
  m.innerHTML = sp.lines
    .map(
      (l, i) =>
        ((i === 0 && sp.measureOpenFirst) || sp.measureOpen) + (l === '' ? '&nbsp;' : l) + '</div>',
    )
    .join('')
  document.body.appendChild(m)
  const lineH = Array.from(m.children).map((e) => (e as HTMLElement).getBoundingClientRect().height)
  const linesTotal = lineH.reduce((a, b) => a + b, 0)
  // Полная высота блока минус сумма строк = постоянная «обвязка».
  m.innerHTML = sp.openFirst + sp.lines.map((l) => (l === '' ? '&nbsp;' : l)).join(sp.sep) + sp.close
  const fullH = (m.firstElementChild as HTMLElement).getBoundingClientRect().height
  document.body.removeChild(m)
  return { lineH, chrome: Math.max(0, fullH - linesTotal) }
}

/** Высота одного html-куска в обёртке open (для до-замера хвостов разреза). */
function measurePiece(open: string, html: string): number {
  const m = document.createElement('div')
  m.style.cssText = HOST_CSS
  m.innerHTML = open + (html || '&nbsp;') + '</div>'
  document.body.appendChild(m)
  const h = (m.firstElementChild as HTMLElement).getBoundingClientRect().height
  document.body.removeChild(m)
  return h
}

/**
 * Режет одну логическую строку (html) на «голову», влезающую в budget пикселей,
 * и «хвост». Нужна для абзаца без единого переноса строки, который выше целой
 * страницы, — Word переносит такой абзац построчно, и превью обязано так же.
 *
 * Разрез — по словам текстовых узлов через DOM (innerHTML клонов всегда даёт
 * валидную разметку, теги <b>/<span> не рвутся), позиция ищется бинарным
 * поиском по реальной высоте. null — если в budget не влезает ни одно слово
 * или строка влезает целиком.
 */
function cutHtmlLine(
  open: string,
  html: string,
  budget: number,
): { head: string; tail: string; headH: number } | null {
  const m = document.createElement('div')
  m.style.cssText = HOST_CSS
  m.innerHTML = open + html + '</div>'
  document.body.appendChild(m)
  const box = m.firstElementChild as HTMLElement
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) nodes.push(node as Text)
  const originals = nodes.map((n) => n.nodeValue || '')
  // Слова с хвостовыми пробелами — конкатенация кусков воспроизводит исходник.
  const words = originals.map((s) => s.match(/\S*\s*/g)?.filter(Boolean) ?? [])
  const total = words.reduce((a, w) => a + w.length, 0)

  const showFirst = (k: number) => {
    let left = k
    nodes.forEach((n, i) => {
      const w = words[i]
      if (left >= w.length) {
        n.nodeValue = originals[i]
        left -= w.length
      } else {
        n.nodeValue = w.slice(0, left).join('')
        left = 0
      }
    })
  }

  let lo = 1
  let hi = total
  let best = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    showFirst(mid)
    if (box.getBoundingClientRect().height <= budget) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (best === 0 || best >= total) {
    document.body.removeChild(m)
    return null
  }
  showFirst(best)
  const head = box.innerHTML
  const headH = box.getBoundingClientRect().height
  let left = best
  nodes.forEach((n, i) => {
    const w = words[i]
    if (left >= w.length) {
      n.nodeValue = ''
      left -= w.length
    } else {
      n.nodeValue = w.slice(left).join('')
      left = 0
    }
  })
  const tail = box.innerHTML
  document.body.removeChild(m)
  return { head, tail, headH }
}

/**
 * Раскладка содержания по страницам с измерением реальных высот строк:
 * длинный заголовок переносится на вторую строку и занимает больше места,
 * поэтому фиксированное «N строк на страницу» переполняло бы лист.
 * Возвращает массив страниц с индексами заголовков. Высота строки не зависит
 * от номера страницы, поэтому раскладку можно посчитать ДО пагинации контента
 * (номера подставляются позже).
 */
function packToc(headings: HeadingRec[]): number[][] {
  const el = getHost()
  el.innerHTML = TOC_HEADER_HTML + headings.map((h) => buildTocRow(h, '88')).join('')
  const kids = el.children
  const headerH = (kids[0] as HTMLElement).getBoundingClientRect().height
  const pages: number[][] = [[]]
  let y = headerH
  for (let i = 0; i < headings.length; i++) {
    const rowH = kids[i + 1] ? (kids[i + 1] as HTMLElement).getBoundingClientRect().height : 24
    if (pages[pages.length - 1].length > 0 && y + rowH > PAGE_CONTENT_HEIGHT_PX) {
      pages.push([])
      y = 0
    }
    pages[pages.length - 1].push(i)
    y += rowH
  }
  el.innerHTML = ''
  return pages
}

/**
 * Раскладывает подготовленные блоки по страницам, измеряя реальные высоты в
 * скрытом DOM-хосте. recOffset — число страниц перед этим куском контента
 * (титульник/реферат/содержание): прибавляется к номерам страниц заголовков.
 */
function layoutBlocks(out: RenderedBlock[], recOffset: number): string[][] {
  if (out.length === 0) return []
  const el = getHost()
  el.innerHTML = out.map((b) => '<div>' + b.html + '</div>').join('')
  const kids = el.children
  const pagesB: string[][] = [[]]
  let y = 0
  const heightOf = (i: number) =>
    kids[i] ? (kids[i] as HTMLElement).getBoundingClientRect().height : 24
  const pushFrag = (html: string) => pagesB[pagesB.length - 1].push(html)
  const newPage = () => {
    pagesB.push([])
    y = 0
  }

  out.forEach((b, i) => {
    // Принудительный разрыв страницы («---»): начинаем новую страницу и сам
    // блок ничего не рисует.
    if (b.isPageBreak) {
      if (pagesB[pagesB.length - 1].length > 0) newPage()
      return
    }
    // Таблица делится построчно между страницами (шапка повторяется).
    if (b.table) {
      const t = b.table
      const { capH, headH, rowH } = measureTable(t)
      // Должны начать на текущей странице хотя бы подпись + шапка + первая
      // строка; иначе переносим начало таблицы на новую страницу.
      const minFirst = capH + headH + (rowH[0] || 0)
      if (pagesB[pagesB.length - 1].length > 0 && y + minFirst > PAGE_CONTENT_HEIGHT_PX) newPage()
      let first = true
      let frag: string[] = []
      let fragH = capH + headH
      const flush = () => {
        pushFrag(
          '<div>' +
            (first ? t.caption : '') +
            t.openTag +
            t.headHtml +
            '<tbody>' +
            frag.join('') +
            '</tbody></table></div>',
        )
        y += fragH
        first = false
        frag = []
      }
      for (let r = 0; r < t.rows.length; r++) {
        const rh = rowH[r] || 24
        if (frag.length > 0 && y + fragH + rh > PAGE_CONTENT_HEIGHT_PX) {
          flush()
          newPage()
          fragH = headH // на продолжении — только шапка, без подписи
        }
        frag.push(t.rows[r])
        fragH += rh
      }
      flush()
      return
    }
    // Делимый блок (листинг кода, длинный абзац) делится построчно между
    // страницами, иначе блок выше страницы налезает на её нижнее поле.
    if (b.split) {
      const sp = b.split
      const { lineH, chrome } = measureSplit(sp)
      const n = sp.lines.length
      const lh = (r: number) => lineH[r] || 24
      // Строка выше этого бюджета не поместится даже на пустой странице —
      // придётся резать её по словам (cutHtmlLine).
      const maxLineBudget = PAGE_CONTENT_HEIGHT_PX - chrome
      // Орфан-контроль (как в Word): блок из 2+ строк не начинается на
      // странице, куда влезает лишь одна его строка. Сплошной абзац (одна
      // логическая строка) может НАЧАТЬСЯ в остатке страницы хотя бы двумя
      // визуальными строками — Word разрывает такой абзац, а не переносит
      // целиком; требовать весь абзац нельзя.
      const firstNeed =
        n === 1
          ? chrome +
            Math.min(
              lh(0),
              2 * measurePiece(sp.measureOpenFirst || sp.measureOpen, '&nbsp;'),
              maxLineBudget,
            )
          : chrome + Math.min(lh(0), maxLineBudget) + (n > 1 ? Math.min(lh(1), maxLineBudget) : 0)
      if (
        pagesB[pagesB.length - 1].length > 0 &&
        y + Math.min(firstNeed, PAGE_CONTENT_HEIGHT_PX) > PAGE_CONTENT_HEIGHT_PX
      )
        newPage()
      // Куски текущего фрагмента: html + измеренная высота. Пустой фрагмент
      // не выводится (возникает, когда разрез абзаца не удался и целый блок
      // уходит на новую страницу — красная строка первой части сохраняется).
      let frag: { html: string; h: number }[] = []
      let fragH = chrome
      let firstFrag = true
      const flush = () => {
        if (frag.length === 0) {
          fragH = chrome
          return
        }
        pushFrag(
          (firstFrag ? sp.openFirst : sp.openCont) +
            frag.map((p) => p.html).join(sp.sep) +
            sp.close,
        )
        y += fragH
        firstFrag = false
        frag = []
        fragH = chrome
      }
      for (let r = 0; r < n; r++) {
        let html = sp.lines[r]
        let h = lh(r)
        let measureOpen = (r === 0 && sp.measureOpenFirst) || sp.measureOpen
        // Одна логическая строка может потребовать несколько разрезов.
        for (;;) {
          const avail = PAGE_CONTENT_HEIGHT_PX - y - fragH
          if (h <= avail) {
            frag.push({ html, h })
            fragH += h
            break
          }
          if (h <= maxLineBudget) {
            // Сплошной абзац (одна логическая строка в несколько визуальных),
            // не влезающий в остаток: Word разрывает его между страницами
            // построчно с контролем висячих строк (widow/orphan — минимум по
            // две строки с каждой стороны). Режем по словам под остаток; если
            // для правил Word места не хватает — абзац уходит целиком.
            if (n === 1) {
              const lineUnit = measurePiece(measureOpen, '&nbsp;')
              const minPart = 2 * lineUnit - 2 // допуск на субпиксели
              if (avail >= minPart) {
                let cut = cutHtmlLine(measureOpen, html, avail)
                if (cut && h - cut.headH < minPart) {
                  // Хвосту не хватает двух строк — Word в этом случае не
                  // переносит абзац целиком, а отдаёт строку из головы
                  // (widow-контроль): пере-режем под голову ≤ h − 2 строки.
                  cut = cutHtmlLine(measureOpen, html, Math.min(avail, h - minPart))
                }
                if (cut && cut.headH >= minPart && h - cut.headH >= minPart) {
                  frag.push({ html: cut.head, h: cut.headH })
                  fragH += cut.headH
                  flush()
                  newPage()
                  html = cut.tail
                  measureOpen = sp.measureOpen // продолжение — без красной строки
                  h = measurePiece(measureOpen, html)
                  continue
                }
              }
            }
            // Строка влезает в пустую страницу — обычный построчный перенос.
            // Видоу-контроль (как в Word): последняя строка блока не остаётся
            // одна на новой странице — перетаскиваем к ней предпоследнюю.
            if (r === n - 1 && frag.length >= 2) {
              const moved = frag.pop()!
              fragH -= moved.h
              flush()
              newPage()
              frag = [moved]
              fragH = chrome + moved.h
            } else {
              flush()
              newPage()
            }
            continue
          }
          // Строка выше целой страницы (сплошной абзац без переносов):
          // отрезаем голову под остаток текущей страницы.
          const cut = avail > 40 ? cutHtmlLine(measureOpen, html, avail) : null
          if (cut) {
            frag.push({ html: cut.head, h: cut.headH })
            fragH += cut.headH
            flush()
            newPage()
            html = cut.tail
            measureOpen = sp.measureOpen // продолжение — без красной строки
            h = measurePiece(measureOpen, html)
            continue
          }
          // В остаток не влезло ни слова — на новую страницу; если и на пустой
          // не влезает (расхождение замера в 1–2px) — кладём как есть,
          // чтобы не зациклиться.
          if (frag.length === 0 && y === 0) {
            frag.push({ html, h })
            fragH += h
            break
          }
          flush()
          newPage()
        }
      }
      flush()
      return
    }
    const hh = heightOf(i)
    const cur = pagesB[pagesB.length - 1]
    let br = false
    if (cur.length > 0) {
      if (b.breakBefore) br = true
      else if (y + hh > PAGE_CONTENT_HEIGHT_PX) {
        // Служебная свободная строка на самой границе листа: высоты блоков в
        // Chrome и Word/LibreOffice дребезжат на ±2–3 мм, и Word при таком
        // остатке ОСТАВЛЯЕТ пустой абзац внизу страницы. Оставляем и мы,
        // урезав его до остатка (пустая строка визуально не отличается,
        // переполнения нет; калибровано по kalman-report: свободная строка
        // после Таблицы 5). Большой дефицит — обычный перенос: пустая строка
        // уедет наверх следующей страницы и будет показана, как в Word.
        if (b.isBlank && y + hh - BLANK_EDGE_TOL_PX <= PAGE_CONTENT_HEIGHT_PX) {
          const rest = PAGE_CONTENT_HEIGHT_PX - y
          if (rest > 0) {
            pagesB[pagesB.length - 1].push('<div style="height:' + rest.toFixed(1) + 'px"></div>')
            y = PAGE_CONTENT_HEIGHT_PX
            return
          }
        }
        br = true
      } else if (b.isHeading || b.keepNext) {
        // Заголовок (или формула с «где») не должен «висеть» один внизу
        // страницы: держим его вместе с НАЧАЛОМ следующего блока. Как в Word,
        // keep_with_next требует места лишь для старта соседа: двух строк
        // делимого блока (орфан-контроль) или подписи+шапки+строки таблицы —
        // а не для целого абзаца (иначе заголовок уезжал бы там, где Word
        // оставляет его с парой строк текста). Для делимого соседа сверх двух
        // строк требуется ЗАПАС в одну строку: переносы слов Chrome и
        // Word/LibreOffice чуть расходятся, и без люфта заголовок оставался
        // бы на странице, где Word уже не смог начать абзац (калибровано по
        // kalman-report: заголовки 3.2 и 5.3).
        const startNeedOf = (idx: number): number => {
          const nb = out[idx]
          if (nb.table) {
            const { capH, headH, rowH } = measureTable(nb.table)
            return capH + headH + (rowH[0] || 0)
          }
          if (nb.split) {
            const { lineH, chrome } = measureSplit(nb.split)
            const unit = measurePiece(nb.split.measureOpenFirst || nb.split.measureOpen, '&nbsp;')
            if (nb.split.lines.length === 1) {
              return chrome + Math.min(lineH[0] || 0, 2 * unit) + unit
            }
            return chrome + (lineH[0] || 0) + (lineH[1] || 0) + unit
          }
          return heightOf(idx)
        }
        const nextHh = i + 1 < out.length ? startNeedOf(i + 1) : 0
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
    // Свободные строки — настоящие пустые абзацы DOCX: Word показывает их и
    // в начале страницы, поэтому и превью их не гасит (isBlank — только
    // маркер дедупликации в renderAll).
    pagesB[pagesB.length - 1].push(b.html)
    y += hh
    if (b.rec && !b.rec.page) b.rec.page = recOffset + pagesB.length
  })
  el.innerHTML = ''
  return pagesB
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

  // Реферат — первый заголовок документа: его страницы идут ДО содержания и
  // в содержание не входят (ГОСТ 7.32: титульный лист → реферат → содержание).
  // (?![а-яё]) вместо \b: JS-\b не считает кириллицу буквами.
  const firstRec = ctx.headings[0]
  const hasReferat = !!firstRec && firstRec.level === 1 && /^реферат(?![а-яё])/i.test(firstRec.label)
  let outRef: RenderedBlock[] = []
  let outMain = out
  if (hasReferat) {
    const hIdx = out.findIndex((b) => b.rec === firstRec)
    let end = out.length
    for (let i = hIdx + 1; i < out.length; i++) {
      // Реферат заканчивается там, где начинается следующий раздел (с новой
      // страницы).
      if (out[i].breakBefore) {
        end = i
        break
      }
    }
    outRef = out.slice(0, end)
    outMain = out.slice(end)
  }
  const tocHeadings = hasReferat ? ctx.headings.slice(1) : ctx.headings

  const titlePages = s.titlePage ? 1 : 0
  const refPages = layoutBlocks(outRef, titlePages)
  const tocPacking = s.toc ? packToc(tocHeadings) : []
  const offset = titlePages + refPages.length + tocPacking.length
  const pagesB = layoutBlocks(outMain, offset)

  const all: { html: string; show: boolean }[] = []
  if (s.titlePage) {
    // Свой титульник (отрендеренная страница PDF/DOCX) — картинкой на весь
    // лист без полей; иначе — сгенерированный из блоков настроек.
    const custom = s.titleCustom ? getAsset(s.titleCustom) : null
    all.push({
      html: custom
        ? '<img src="' + custom + '" style="position:absolute;inset:0;width:100%;height:100%" alt="">'
        : buildTitle(s),
      show: false,
    })
  }
  refPages.forEach((arr) => all.push({ html: arr.join(''), show: true }))
  // Содержание собирается после пагинации контента (номера страниц уже
  // известны), но по заранее измеренной раскладке.
  tocPacking.forEach((idxs, pi) =>
    all.push({
      html:
        (pi === 0 ? TOC_HEADER_HTML : '') +
        idxs
          .map((i) => buildTocRow(tocHeadings[i], String(tocHeadings[i].page || '')))
          .join(''),
      show: true,
    }),
  )
  pagesB.forEach((arr) => all.push({ html: arr.join(''), show: true }))

  // Номер страницы — тем же шрифтом и кеглем, что основной текст (14 пт),
  // одинарным интервалом на позиции нижнего колонтитула Word (10 мм от края).
  return all.map((p, i) => ({
    html:
      p.html +
      (p.show && s.pageNumbers
        ? '<div style="position:absolute;bottom:10mm;left:0;right:0;text-align:center;font-size:14pt;line-height:1.15">' +
          (i + 1) +
          '</div>'
        : ''),
  }))
}
