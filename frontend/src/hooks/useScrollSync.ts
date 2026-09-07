/**
 * Синхронная прокрутка редактора и превью в обе стороны: верх видимой области
 * одной панели держится на том же месте документа, что и верх другой.
 *
 * Как считается (арифметика — в lib/scrollSync.ts):
 *   scrollTop редактора → дробная строка markdown → якорь пагинатора
 *   («строка → страница + смещение») → scrollTop превью, и наоборот.
 *
 * Два момента, на которых такая синхронизация обычно ломается:
 *  1) программная прокрутка второй панели сама порождает событие scroll, и
 *     панели начинают гонять друг друга — поэтому есть «ведущий» с окном
 *     тишины: пока оно не истекло, событие от ведомого игнорируется;
 *  2) при переносе строк одна строка markdown занимает несколько визуальных,
 *     и scrollTop/lineHeight даёт уже не номер строки — тогда смещения строк
 *     замеряются в скрытом двойнике textarea (тот же приём, что у пагинатора
 *     с его скрытым хостом).
 */
import { RefObject, useCallback, useEffect, useRef } from 'react'
import { EDITOR_FONT, EDITOR_PAD_TOP, EDITOR_PAD_X, editorLineHeight } from '../lib/highlight'
import { PREVIEW_PAD_TOP_PX } from '../lib/pageGeometry'
import type { Anchor } from '../lib/paginate'
import {
  EditorMetrics,
  blendEdges,
  editorOffsetForLine,
  lineAtEditorOffset,
  lineForPreviewOffset,
  previewOffsetForLine,
} from '../lib/scrollSync'
import type { Settings } from '../lib/settings'

/** Сколько ведомая панель не перехватывает лидерство после чужой прокрутки. */
const LEAD_MS = 150

interface Options {
  taRef: RefObject<HTMLTextAreaElement>
  previewRef: RefObject<HTMLDivElement>
  anchors: Anchor[]
  zoom: number
  md: string
  settings: Settings
}

/** Замеряет смещения строк в скрытом двойнике textarea (режим переноса). */
function measureLineOffsets(
  ta: HTMLTextAreaElement,
  md: string,
  lh: number,
  fontSize: number,
): number[] {
  const m = document.createElement('div')
  m.style.cssText =
    'position:absolute;left:-99999px;top:0;visibility:hidden;margin:0;padding:0;' +
    'white-space:pre-wrap;overflow-wrap:break-word;' +
    'width:' +
    Math.max(0, ta.clientWidth - 2 * EDITOR_PAD_X) +
    'px;font-family:' +
    EDITOR_FONT +
    ';font-size:' +
    fontSize +
    'px;line-height:' +
    lh +
    'px'
  // Строка на элемент: offsetTop каждого — и есть её смещение. Пустая строка
  // занимает одну строку высоты, поэтому в неё кладём неразрывный пробел.
  const lines = md.split('\n')
  m.innerHTML = lines.map(() => '<div></div>').join('')
  const kids = m.children
  for (let i = 0; i < lines.length; i++) {
    ;(kids[i] as HTMLElement).textContent = lines[i] === '' ? ' ' : lines[i]
  }
  document.body.appendChild(m)
  const offsets: number[] = []
  for (let i = 0; i < lines.length; i++) offsets.push((kids[i] as HTMLElement).offsetTop)
  document.body.removeChild(m)
  return offsets
}

export function useScrollSync({ taRef, previewRef, anchors, zoom, md, settings }: Options) {
  const anchorsRef = useRef(anchors)
  anchorsRef.current = anchors
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const metrics = useRef<EditorMetrics>({
    lineHeight: editorLineHeight(settings.fontSize),
    offsets: null,
  })
  // Сетка строк устарела (сменился текст, кегль, режим переноса или ширина
  // панели) — пересчитаем лениво при следующей прокрутке, а не на каждый ввод.
  const dirty = useRef(true)
  const leader = useRef<'editor' | 'preview' | null>(null)
  const leaderUntil = useRef(0)
  const frame = useRef<number | null>(null)

  const refreshMetrics = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const lh = editorLineHeight(settings.fontSize)
    metrics.current = {
      lineHeight: lh,
      // Без переноса строки равной высоты — таблица смещений не нужна.
      offsets: settings.wordWrap ? measureLineOffsets(ta, md, lh, settings.fontSize) : null,
    }
    dirty.current = false
  }, [taRef, md, settings.fontSize, settings.wordWrap])

  const syncFromEditor = useCallback(() => {
    const ta = taRef.current
    const pv = previewRef.current
    if (!ta || !pv) return
    if (dirty.current) refreshMetrics()
    const line = lineAtEditorOffset(metrics.current, ta.scrollTop - EDITOR_PAD_TOP)
    const off = previewOffsetForLine(anchorsRef.current, line)
    if (off === null) return
    pv.scrollTop = blendEdges(
      PREVIEW_PAD_TOP_PX + off * zoomRef.current,
      ta.scrollTop,
      ta.scrollHeight - ta.clientHeight,
      pv.scrollHeight - pv.clientHeight,
    )
  }, [taRef, previewRef, refreshMetrics])

  const syncFromPreview = useCallback(() => {
    const ta = taRef.current
    const pv = previewRef.current
    if (!ta || !pv) return
    if (dirty.current) refreshMetrics()
    const line = lineForPreviewOffset(
      anchorsRef.current,
      (pv.scrollTop - PREVIEW_PAD_TOP_PX) / zoomRef.current,
    )
    if (line === null) return
    ta.scrollTop = blendEdges(
      EDITOR_PAD_TOP + editorOffsetForLine(metrics.current, line),
      pv.scrollTop,
      pv.scrollHeight - pv.clientHeight,
      ta.scrollHeight - ta.clientHeight,
    )
  }, [taRef, previewRef, refreshMetrics])

  // Прокрутка сыплет событиями чаще кадра — считаем раз в кадр.
  const schedule = useCallback((fn: () => void) => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      fn()
    })
  }, [])

  useEffect(() => {
    const ta = taRef.current
    const pv = previewRef.current
    if (!ta || !pv) return

    const take = (who: 'editor' | 'preview'): boolean => {
      const now = Date.now()
      // Ведомая панель молчит, пока не истечёт окно тишины: её scroll —
      // эхо нашей же программной прокрутки.
      if (leader.current && leader.current !== who && now < leaderUntil.current) return false
      leader.current = who
      leaderUntil.current = now + LEAD_MS
      return true
    }

    const onEditor = () => {
      if (take('editor')) schedule(syncFromEditor)
    }
    const onPreview = () => {
      if (take('preview')) schedule(syncFromPreview)
    }
    ta.addEventListener('scroll', onEditor, { passive: true })
    pv.addEventListener('scroll', onPreview, { passive: true })
    return () => {
      ta.removeEventListener('scroll', onEditor)
      pv.removeEventListener('scroll', onPreview)
    }
  }, [taRef, previewRef, schedule, syncFromEditor, syncFromPreview])

  // Сетка строк зависит от текста, кегля, режима переноса и ширины панели.
  useEffect(() => {
    dirty.current = true
  }, [md, settings.fontSize, settings.wordWrap])

  useEffect(() => {
    const ta = taRef.current
    if (!ta || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      dirty.current = true
    })
    ro.observe(ta)
    return () => ro.disconnect()
  }, [taRef])

  // После пересчёта страниц (и смены масштаба) якоря другие — подтягиваем
  // превью под текущее место в редакторе, иначе панели расходятся после правки.
  useEffect(() => {
    if (anchors.length === 0) return
    // До первой прокрутки не вмешиваемся: иначе при открытии документа превью
    // сразу уехало бы с титульного листа на первую страницу текста (строке 0
    // соответствует первый содержательный блок, а не титульник).
    if (leader.current === null) return
    if (leader.current === 'preview' && Date.now() < leaderUntil.current) return
    schedule(syncFromEditor)
  }, [anchors, zoom, schedule, syncFromEditor])
}
