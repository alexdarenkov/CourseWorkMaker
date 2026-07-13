import { getAsset, getImageSize } from './assets'
import type { Settings } from './settings'
import { Block, esc, inline, isStructural, katexHtml, splitGde } from './markdown'

// Метрики строки Word/LibreOffice (откалиброваны по PDF LibreOffice):
// «полуторный» интервал Word — это 1,5 × СОБСТВЕННАЯ высота строки шрифта
// (hhea-метрики), а не 1,5 em. Times New Roman: 1,15 em → 14 пт × 1,725 =
// 24,15 пт на строку (30 строк на листе, а не 34 при line-height:1.5);
// Courier New: 1,1333 em → 12 пт × 1,7 = 20,4 пт. В конвертере та же
// величина — LINE_PT/FREE_LINE (24,15 пт) в gost.py. Менять только парой.
export const LINE_HEIGHT = '1.725' // основной текст, полуторный интервал
export const LINE_HEIGHT_CODE = '1.7' // листинг Courier New 12пт, полуторный
export const LINE_HEIGHT_SINGLE = '1.15' // одинарный интервал (подписи рисунков и таблиц)
export const LINE_PT = '24.15pt' // высота одной строки = свободная строка

// Заголовки — БЕЗ дополнительных интервалов до/после: между заголовком и
// текстом (и между заголовками) остаётся обычный полуторный межстрочный
// интервал. В DOCX парно: space_before/space_after = 0 у стилей Heading 1..3
// (gost.py).

// Максимальный размер иллюстрации — как в конвертере (gost.py): 150×180 мм.
const MAX_IMG_W_MM = 150
const MAX_IMG_H_MM = 180

// Абзац пояснения к формуле («где …» и каждое следующее) — с красной строки;
// продолжение абзаца после разреза между страницами — без отступа.
const GDE_OPEN = '<div style="text-align:left;text-indent:12.5mm;overflow-wrap:break-word">'
const GDE_CONT = '<div style="text-align:left;text-indent:0;overflow-wrap:break-word">'

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
  // Служебная свободная строка (настоящий пустой абзац DOCX); флаг — только
  // для дедупликации соседних свободных строк в renderAll, пагинатор её
  // рисует всегда (Word пустые абзацы не гасит).
  isBlank?: boolean
  isPageBreak?: boolean
  // Блок не остаётся один внизу страницы — держится с началом следующего
  // (заголовки, формула с пояснением «где»); в DOCX это keep_with_next.
  keepNext?: boolean
  rec?: HeadingRec
  // Полезная нагрузка таблицы — пагинатор может делить её построчно между
  // страницами, повторяя шапку.
  table?: { caption: string; openTag: string; headHtml: string; rows: string[] }
  // Полезная нагрузка делимого блока (листинг кода, абзац с переносами).
  // Пагинатор делит его построчно между страницами, чтобы блок выше страницы
  // не налезал на нижнее поле. В Word такой блок разбивается сам.
  //   openFirst/openCont — обёртка первой части и продолжения (у абзаца у
  //     продолжения снят красная строка, у кода — рамка одинаковая);
  //   sep — чем склеиваются строки внутри части ('\n' для кода в pre-wrap,
  //     '<br>' для абзаца);
  //   measureOpen — обёртка для замера высоты одной строки по отдельности.
  //     ВАЖНО: ширина текста в measureOpen обязана совпадать с реальным боксом
  //     (те же паддинги/рамки), иначе строки переносятся по-разному и высоты
  //     врут — блок вылезает за нижнее поле листа;
  //   measureOpenFirst — замер первой строки (у абзаца она с красной строкой).
  split?: {
    openFirst: string
    openCont: string
    close: string
    sep: string
    lines: string[]
    measureOpen: string
    measureOpenFirst?: string
  }
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
  const ctx = {
    sec: 0,
    sub: 0,
    sub2: 0,
    fig: 0,
    tab: 0,
    form: 0,
    headings: [] as HeadingRec[],
    inBib: false,
    // Сквозной счётчик нумерованных списков — продолжается через подряд
    // идущие 'ol'-блоки (пустые строки между пунктами не прерывают список),
    // любой другой блок его обнуляет.
    ol: 0,
  }
  const out: RenderedBlock[] = []
  const P = (html: string, extra?: Partial<RenderedBlock>) => out.push({ html, ...extra })
  // Свободная строка (вокруг формул/таблиц/рисунков) — НАСТОЯЩИЙ пустой
  // абзац DOCX (перенос строки, а не межабзацный интервал: нормоконтроль
  // проверяет именно пустые строки). Word показывает такой абзац и в начале
  // страницы — пагинатор превью его тоже НЕ гасит. isBlank — только маркер
  // дедупликации: если предыдущий блок УЖЕ служебная свободная строка
  // (после таблицы идёт рисунок — у обоих «своя»), вторую не добавляем — в
  // DOCX build() тоже вставляет ОДИН пустой абзац на двоих (pending_free).
  // hard=true — пользовательская пустая строка или спейсер листинга: НЕ
  // дедуплицируется со служебными (в DOCX это отдельный абзац).
  const blank = (hard = false) => {
    if (!hard && out.length && out[out.length - 1].isBlank) return
    P('<div style="line-height:' + LINE_HEIGHT + '">&nbsp;</div>', hard ? undefined : { isBlank: true })
  }

  // Пояснения к формуле «где …»: каждое — отдельным абзацем с красной строки
  // (как в конвертере). Абзац делим между страницами построчно (split), как
  // обычный текст, — иначе длинное пояснение целиком падало бы на следующую
  // страницу там, где Word разрывает абзац.
  const pushGde = (gde: string[]) => {
    gde.forEach((l) => {
      const html = inline(l)
      P(GDE_OPEN + html + '</div>', {
        split: {
          openFirst: GDE_OPEN,
          openCont: GDE_CONT,
          close: '</div>',
          sep: '<br>',
          lines: [html],
          measureOpen: GDE_CONT,
          measureOpenFirst: GDE_OPEN,
        },
      })
    })
  }

  let skipNext = false
  // Предыдущий выведенный блок — формула (граница формульной группы уже
  // оформлена): подряд идущие формулы НЕ разделяются свободными строками,
  // переносы остаются только между текстом и формулами.
  let afterMath = false
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi]
    if (skipNext) {
      skipNext = false
      continue
    }
    const prevMath = afterMath
    afterMath = false
    // Сквозная нумерация списков продолжается только через подряд идущие
    // 'ol'-блоки (пустые строки между пунктами не прерывают список), любой
    // другой блок обнуляет счётчик.
    if (b.type !== 'blank' && b.type !== 'ol') ctx.ol = 0
    if (b.type === 'h1') {
      const txt = b.text.trim()
      if (isStructural(txt)) {
        ctx.inBib = /^список/i.test(txt)
        const rec: HeadingRec = { label: txt.toUpperCase(), level: 1, page: 0 }
        ctx.headings.push(rec)
        P(
          '<div style="text-align:center;font-weight:bold">' +
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
          '<div style="font-weight:bold;text-indent:12.5mm">' +
            ctx.sec +
            '&nbsp;' +
            inline(b.text) +
            '</div>',
          { breakBefore: true, isHeading: true, rec },
        )
      }
    } else if (b.type === 'h2' || b.type === 'h3') {
      if (b.type === 'h2') {
        ctx.sub++
        ctx.sub2 = 0
      } else {
        ctx.sub2++
      }
      // Номер только внутри нумерованного раздела; подразделы структурных
      // элементов (Введение/Заключение) и до первого раздела — без номера.
      const num =
        ctx.sec > 0
          ? b.type === 'h2'
            ? ctx.sec + '.' + ctx.sub
            : ctx.sec + '.' + ctx.sub + '.' + ctx.sub2
          : ''
      const prefix = num ? num + '&nbsp;' : ''
      const rec: HeadingRec = {
        label: (num ? num + ' ' : '') + b.text.trim(),
        level: b.type === 'h2' ? 2 : 3,
        page: 0,
      }
      ctx.headings.push(rec)
      // Подзаголовок — обычная строка полуторного интервала: без спейсеров и
      // отступов до/после (space_before/space_after = 0 у Heading 2/3 в DOCX).
      P(
        '<div style="font-weight:bold;text-indent:12.5mm">' + prefix + inline(b.text) + '</div>',
        { isHeading: true, rec },
      )
    } else if (b.type === 'p') {
      const gde = splitGde(b.text)
      if (gde) {
        pushGde(gde)
      } else {
        // Абзац с ручными переносами — по левому краю (выравнивание по ширине
        // растягивало бы короткие строки перед переносом).
        const align = b.text.includes('\n') ? 'left' : 'justify'
        // Длинный абзац (особенно набранный одиночными переносами) может быть
        // выше страницы — делаем его делимым по строкам. Красная строка только
        // у самой первой части, продолжения на новой странице — без отступа.
        // overflow-wrap: слово шире строки (URL) ломается по символам, а не
        // вылезает за поле листа (Word делает так же).
        const lines = inline(b.text).split('<br>')
        const openFirst =
          '<div style="text-align:' + align + ';text-indent:12.5mm;overflow-wrap:break-word">'
        const openCont =
          '<div style="text-align:' + align + ';text-indent:0;overflow-wrap:break-word">'
        P(openFirst + lines.join('<br>') + '</div>', {
          split: {
            openFirst,
            openCont,
            close: '</div>',
            sep: '<br>',
            lines,
            measureOpen: '<div style="text-align:' + align + ';overflow-wrap:break-word">',
            // Первая строка абзаца — с красной строкой: без неё замер первой
            // строки даёт другой перенос и неверную высоту.
            measureOpenFirst:
              '<div style="text-align:' + align + ';overflow-wrap:break-word;text-indent:12.5mm">',
          },
        })
      }
    } else if (b.type === 'ul' || b.type === 'ol') {
      // Пункт перечисления — как обычный абзац с красной строки: маркер
      // («–» или «N)») на абзацном отступе, продолжение длинного пункта
      // переносится к ЛЕВОМУ полю — без висячего отступа. NBSP после маркера —
      // текст не отрывается от маркера при переносе строки (в DOCX тот же
      // приём, см. _list в gost.py). Список источников: номер С ТОЧКОЙ
      // («1.») — требование пользователя (вуз; выписка ГОСТ 6.16 говорит
      // «без точки»), та же вёрстка с красной строки.
      b.items.forEach((it) => {
        let marker = '–'
        if (b.type === 'ol') {
          ctx.ol++
          marker = ctx.inBib && s.bibliography ? ctx.ol + '.' : ctx.ol + ')'
        }
        P(
          '<div style="text-align:justify;text-indent:12.5mm;overflow-wrap:break-word">' +
            marker +
            '&nbsp;' +
            inline(it) +
            '</div>',
        )
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
      const capTxt = s.autoNumber ? 'Рисунок ' + ctx.fig + ' – ' + inline(cap) : inline(cap)
      blank() // свободная строка перед иллюстрацией
      // Многострочная подпись — через один межстрочный интервал (ГОСТ; в DOCX
      // у абзаца подписи line_spacing = 1.0).
      P(
        '<div style="text-align:center"><div style="display:flex;justify-content:center">' +
          inner +
          '</div><div style="line-height:' +
          LINE_HEIGHT_SINGLE +
          '">' +
          capTxt +
          '</div></div>',
      )
      blank() // свободная строка после подписи рисунка
    } else if (b.type === 'mermaid') {
      ctx.fig++
      const cap = b.caption || 'Схема'
      const svg = mermaidHtml(b.code)
      const body = svg
        ? '<div style="display:flex;justify-content:center;max-width:100%;overflow:hidden">' + fitSvg(svg) + '</div>'
        : '<div style="width:125mm;height:62mm;border:1px dashed #999;display:flex;align-items:center;justify-content:center;color:#888;font-size:11pt">Построение схемы…</div>'
      const capTxt = s.autoNumber ? 'Рисунок ' + ctx.fig + ' – ' + inline(cap) : inline(cap)
      blank() // свободная строка перед схемой
      P(
        '<div style="text-align:center"><div style="display:flex;justify-content:center">' +
          body +
          '</div><div style="line-height:' +
          LINE_HEIGHT_SINGLE +
          '">' +
          capTxt +
          '</div></div>',
      )
      blank() // свободная строка после подписи схемы
    } else if (b.type === 'table') {
      ctx.tab++
      const cap = b.caption
        ? 'Таблица ' + ctx.tab + ' – ' + inline(b.caption)
        : s.autoNumber
          ? 'Таблица ' + ctx.tab
          : ''
      const head = b.rows[0] || []
      const body = b.rows.slice(1)
      // Широкая таблица — уменьшенный кегль (ГОСТ 6.6 допускает); правило
      // синхронизировано с конвертером: >6 колонок → 12 пт.
      const cols = b.rows.reduce((m, r) => Math.max(m, r.length), 0)
      // Ширины колонок — единый с конвертером детерминированный алгоритм
      // (вес = длина самого длинного содержимого, кламп 3..30) и фиксированная
      // раскладка: авто-раскладки Chrome и Word делят ширину по-разному, из-за
      // чего высота таблицы (и число страниц) расходились.
      const weights = Array.from({ length: cols }, (_, ci) =>
        Math.max(3, Math.min(30, b.rows.reduce((m, r) => Math.max(m, (r[ci] || '').length), 0))),
      )
      const weightSum = weights.reduce((a, w) => a + w, 0)
      const colgroup =
        '<colgroup>' +
        weights
          .map((w) => '<col style="width:' + ((w / weightSum) * 100).toFixed(2) + '%">')
          .join('') +
        '</colgroup>'
      const openTag =
        '<table style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:' +
        (cols <= 6 ? 14 : 12) +
        'pt;line-height:' +
        LINE_HEIGHT +
        '">' +
        colgroup
      const headHtml =
        '<thead><tr>' +
        head
          .map(
            (c) =>
              '<th style="border:1px solid #000;padding:1.5mm 2mm;font-weight:bold;text-align:center;vertical-align:middle;word-break:break-word">' +
              inline(c) +
              '</th>',
          )
          .join('') +
        '</tr></thead>'
      const rowsHtml = body.map(
        (r) =>
          '<tr>' +
          r
            .map(
              (c) =>
                '<td style="border:1px solid #000;padding:1.5mm 2mm;text-align:center;vertical-align:middle;word-break:break-word">' +
                inline(c) +
                '</td>',
            )
            .join('') +
          '</tr>',
      )
      // Подпись «Таблица N …» — одинарным интервалом (многострочная — через
      // один интервал, как у рисунков) и ВПЛОТНУЮ к таблице (нулевой отступ;
      // в DOCX — line_spacing=1.0 и space_after=0). Свободная строка после
      // таблицы — отдельным blank-блоком (как в DOCX). Цельный html — для
      // замера и для случая, когда таблица помещается; payload `table`
      // пагинатор использует для деления.
      const capHtml = cap ? '<div style="line-height:' + LINE_HEIGHT_SINGLE + '">' + cap + '</div>' : ''
      const html =
        '<div>' + capHtml + openTag + headHtml + '<tbody>' + rowsHtml.join('') + '</tbody></table></div>'
      blank() // свободная строка перед подписью таблицы
      P(html, { table: { caption: capHtml, openTag, headHtml, rows: rowsHtml } })
      blank() // свободная строка после таблицы
    } else if (b.type === 'code') {
      const open =
        '<div style="border:1px solid #000;padding:3mm 4mm;font-family:\'Courier New\',Courier,monospace;font-size:12pt;line-height:' +
        LINE_HEIGHT_CODE +
        ';white-space:pre-wrap;word-break:break-word;text-align:left">'
      const close = '</div>'
      const lines = esc(b.code).split('\n')
      // Свободная строка ДО листинга — «жёсткая» (в DOCX это настоящий
      // пустой абзац-спейсер: space_before у таблиц Word не работает, поэтому
      // он не гасится в начале страницы); ПОСЛЕ — обычная (space_before
      // следующего блока).
      blank(true)
      // Цельный html для случая, когда листинг помещается; payload `split`
      // пагинатор использует для построчного деления длинного листинга.
      // В замере — прозрачные боковые рамки: ширина текста должна совпадать с
      // реальным боксом до пикселя, иначе перенос строк (и высота) отличается.
      P(open + lines.join('\n') + close, {
        split: {
          openFirst: open,
          openCont: open,
          close,
          sep: '\n',
          lines,
          measureOpen:
            '<div style="font-family:\'Courier New\',Courier,monospace;font-size:12pt;line-height:' +
            LINE_HEIGHT_CODE +
            ';white-space:pre-wrap;word-break:break-word;padding:0 4mm;border-left:1px solid transparent;border-right:1px solid transparent">',
        },
      })
      blank()
    } else if (b.type === 'math') {
      ctx.form++
      const k = katexHtml(b.code, true)
      const numHtml = s.autoNumber
        ? '<div style="width:15mm;text-align:right;flex-shrink:0">(' +
          ctx.form +
          ')</div><div style="width:15mm;flex-shrink:0;order:-1"></div>'
        : ''
      // Свободная строка до формулы и после неё; если за формулой идёт «где …» —
      // свободная строка после пояснения (ГОСТ 6.8), и формула не отрывается
      // от пояснения при переносе страницы (keepNext). Формулы ПОДРЯД идут
      // без свободных строк между собой (пустая строка только вокруг группы).
      const nxt = blocks[bi + 1]
      const gde = nxt && nxt.type === 'p' ? splitGde(nxt.text) : null
      if (!prevMath) blank()
      P(
        '<div style="display:flex;align-items:center"><div style="flex:1;text-align:center;overflow:hidden">' +
          k +
          '</div>' +
          numHtml +
          '</div>',
        gde ? { keepNext: true } : undefined,
      )
      if (gde) {
        pushGde(gde)
        skipNext = true
      }
      const nextIsMath = blocks[bi + (gde ? 2 : 1)]?.type === 'math'
      // После «где» перенос ставится всегда (это текст); после «голой» формулы —
      // только если дальше не формула.
      if (gde || !nextIsMath) blank()
      afterMath = true
    } else if (b.type === 'quote') {
      // Как в DOCX: отступ слева без вертикальных зазоров.
      P('<div style="padding-left:12.5mm;font-style:italic">' + inline(b.text) + '</div>')
    } else if (b.type === 'blank') {
      // Пустая строка, вставленная пользователем (двойной Enter) — в DOCX это
      // НАСТОЯЩИЙ пустой абзац, который Word показывает и в начале страницы,
      // поэтому «жёсткая» (не гасится пагинатором).
      blank(true)
    } else if (b.type === 'pagebreak') {
      // «---» — принудительный разрыв страницы.
      P('', { isPageBreak: true })
    } else if (b.type === 'hr') {
      // Спейсер в DOCX — пустой абзац одинарного интервала: 14пт × 1,15.
      P('<div style="height:16.1pt"></div>')
    }
  }
  return { out, ctx: { fig: ctx.fig, tab: ctx.tab, form: ctx.form, headings: ctx.headings } }
}

/** Строка «вся прописными» (тип работы) выделяется крупнее и полужирно. */
function isUpperLine(line: string): boolean {
  return line.length > 2 && line === line.toUpperCase() && /[А-ЯA-Z]/.test(line)
}

export function buildTitle(S: Settings): string {
  const u = esc
  const lines = (text: string) => text.split('\n').map((l) => l.trim())

  const header = lines(S.titleHeader)
    .filter(Boolean)
    .map(
      (l, i) =>
        '<div style="font-size:12pt;line-height:1.45;padding-top:' + (i ? 2 : 0) + 'mm">' + u(l) + '</div>',
    )
    .join('')

  const logoSrc = S.titleLogo?.startsWith('asset:') ? getAsset(S.titleLogo) : S.titleLogo
  // img в Tailwind-префлайте блочный — центрируем флексом, а не text-align.
  const logo = logoSrc
    ? '<div style="display:flex;justify-content:center;padding-top:8mm"><img src="' +
      esc(logoSrc) +
      '" style="max-height:40mm;max-width:60mm" alt=""></div>'
    : ''

  const work = lines(S.titleWork)
    .filter(Boolean)
    .map((l) =>
      isUpperLine(l)
        ? '<div style="font-size:18pt;font-weight:bold;letter-spacing:.06em;line-height:1.6">' + u(l) + '</div>'
        : '<div style="line-height:1.6">' + u(l) + '</div>',
    )
    .join('')
  const topicText = S.topic.trim()
  const quoted = /^[«"]/.test(topicText) ? u(topicText) : '«' + u(topicText) + '»'
  const topic = topicText ? '<div style="line-height:1.6;padding-top:1mm"><b>' + quoted + '</b></div>' : ''

  // Исполнители: «Метка: текст» → метка слева, текст справа; строки без
  // метки — справа; пустая строка — вертикальный отступ.
  const people = lines(S.titlePeople)
    .map((l) => {
      if (!l) return '<div style="height:6mm"></div>'
      const m = l.match(/^([^:]{1,24}):\s*(.*)$/)
      if (m)
        return (
          '<div style="display:flex;justify-content:space-between;line-height:1.7;font-size:13pt"><span>' +
          u(m[1]) + ':</span><span>' + u(m[2]) + '</span></div>'
        )
      return '<div style="text-align:right;line-height:1.7;font-size:13pt">' + u(l) + '</div>'
    })
    .join('')

  const bottom = lines(S.titleBottom)
    .filter(Boolean)
    .map((l) => '<div style="font-size:13pt;line-height:1.5">' + u(l) + '</div>')
    .join('')

  return (
    '<div style="display:flex;flex-direction:column;height:257mm;text-align:center">' +
    header +
    logo +
    '<div style="flex:1.2"></div>' +
    work +
    topic +
    '<div style="flex:1.4"></div>' +
    '<div style="text-align:left">' +
    people +
    '</div>' +
    '<div style="flex:1.2"></div>' +
    bottom +
    '</div>'
  )
}

// «СОДЕРЖАНИЕ» — обычная строка полуторного интервала, без отступа после
// (как Heading 1 в DOCX: space_after = 0).
export const TOC_HEADER_HTML =
  '<div style="text-align:center;font-weight:bold">СОДЕРЖАНИЕ</div>'

// Отточие — настоящие точки (как в поле TOC Word), а не пунктирная линия:
// лишние уходят вправо и обрезаются overflow:hidden контейнера.
const TOC_DOTS = ' ' + '. '.repeat(150)

/** Одна строка содержания: отступ по уровню, отточие, номер страницы справа.
 *
 * Точки — инлайн-спан НУЛЕВОЙ ширины с nowrap сразу после текста: они
 * переполняются вправо от конца последней строки заголовка (у переносящегося
 * заголовка нет зазора перед отточием, как в Word) и обрезаются
 * overflow:hidden своей flex-ячейки. Номер — отдельная ячейка справа, на
 * уровне последней строки (align-items:flex-end). Высота строки не зависит от
 * номера — пагинатор измеряет строки заранее. */
export function buildTocRow(h: HeadingRec, page: string): string {
  // Отступы записей содержания: подразделы — 0,5 см, пункты — 1 см
  // (в DOCX те же значения у стилей TOC 2 / TOC 3).
  const ind = h.level === 1 ? 0 : h.level === 2 ? 5 : 10
  return (
    '<div style="display:flex;align-items:flex-end;padding-left:' +
    ind +
    'mm;line-height:' +
    LINE_HEIGHT +
    '">' +
    '<span style="flex:1;overflow:hidden">' +
    esc(h.label) +
    '<span style="display:inline-block;width:0;white-space:nowrap">' +
    TOC_DOTS +
    '</span></span>' +
    '<span style="flex-shrink:0;padding-left:1mm">' +
    page +
    '</span></div>'
  )
}
