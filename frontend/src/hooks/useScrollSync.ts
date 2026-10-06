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
import { RefObject, useCallback, useEffect, useMemo, useRef } from 'react'
import { EDITOR_FONT, EDITOR_PAD_TOP, EDITOR_PAD_X, editorLineHeight } from '../lib/highlight'
import { PREVIEW_PAD_TOP_PX } from '../lib/pageGeometry'
import type { Anchor, Page } from '../lib/paginate'
import {
  EditorMetrics,
  blendEdges,
  contentOffset,
  expandContentOffset,
  generatedRanges,
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
  pages: Page[]
  zoom: number
  md: string
  settings: Settings
  collapsed?: 'none' | 'editor' | 'preview'
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

export function useScrollSync({ taRef, previewRef, anchors, pages, zoom, md, settings, collapsed = 'none' }: Options) {
  const ranges = useMemo(() => generatedRanges(pages), [pages])
  const rangesRef = useRef(ranges)
  rangesRef.current = ranges
  const previewPosition = useRef<
    { kind: 'text'; line: number } |
    { kind: 'title' | 'toc'; index: number; fraction: number } | null
  >(null)
  // Проверяем именно ожидаемое положение: запоздалое scroll-событие после
  // программного перемещения не должно менять ведущую панель.
  const expected = useRef<{ editor: number | null; preview: number | null }>({ editor: null, preview: null })
  const setScroll = useCallback((who: 'editor' | 'preview', el: HTMLElement, top: number) => {
    el.scrollTop = top
    expected.current[who] = el.scrollTop
  }, [])
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
  const previousCollapsed = useRef(collapsed)

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
    const off = previewOffsetForLine(anchorsRef.current, line, rangesRef.current)
    if (off === null) return
    const scale = zoomRef.current
    const excluded = rangesRef.current
    if (excluded.length === 0) {
      setScroll('preview', pv, blendEdges(
        PREVIEW_PAD_TOP_PX + off * scale, ta.scrollTop,
        ta.scrollHeight - ta.clientHeight, pv.scrollHeight - pv.clientHeight,
      ))
      return
    }
    // Притягиваем края в ленте исходного текста: титульник и содержание
    // не участвуют даже в сглаживании у начала/конца документа.
    const max = Math.max(0, pv.scrollHeight - pv.clientHeight)
    const contentMax = contentOffset(Math.max(0, (max - PREVIEW_PAD_TOP_PX) / scale), excluded)
    const target = blendEdges(
      contentOffset(off, excluded) * scale,
      ta.scrollTop,
      ta.scrollHeight - ta.clientHeight,
      contentMax * scale,
    )
    setScroll('preview', pv, Math.min(max,
      PREVIEW_PAD_TOP_PX + expandContentOffset(target / scale, excluded) * scale))
  }, [taRef, previewRef, refreshMetrics, setScroll])

  const syncFromPreview = useCallback(() => {
    const ta = taRef.current
    const pv = previewRef.current
    if (!ta || !pv) return
    if (dirty.current) refreshMetrics()
    const scale = zoomRef.current
    const excluded = rangesRef.current
    const offset = Math.max(0, (pv.scrollTop - PREVIEW_PAD_TOP_PX) / scale)
    const generated = excluded.find((r) => offset >= r.start && offset < r.end)
    if (generated) {
      previewPosition.current = {
        kind: generated.kind,
        index: excluded.filter((r) => r.kind === generated.kind).indexOf(generated),
        fraction: (offset - generated.start) / (generated.end - generated.start),
      }
      return
    }
    const line = lineForPreviewOffset(anchorsRef.current, offset, excluded)
    if (line === null) return
    previewPosition.current = { kind: 'text', line }
    setScroll('editor', ta, blendEdges(
      EDITOR_PAD_TOP + editorOffsetForLine(metrics.current, line),
      excluded.length ? contentOffset(offset, excluded) * scale : pv.scrollTop,
      excluded.length
        ? contentOffset(Math.max(0, (pv.scrollHeight - pv.clientHeight - PREVIEW_PAD_TOP_PX) / scale), excluded) * scale
        : pv.scrollHeight - pv.clientHeight,
      ta.scrollHeight - ta.clientHeight,
    ))
  }, [taRef, previewRef, refreshMetrics, setScroll])

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
      if (expected.current.editor !== null && Math.abs(ta.scrollTop - expected.current.editor) < 1) return
      expected.current.editor = null
      if (take('editor')) schedule(syncFromEditor)
    }
    const onPreview = () => {
      if (expected.current.preview !== null && Math.abs(pv.scrollTop - expected.current.preview) < 1) return
      expected.current.preview = null
      if (take('preview')) schedule(syncFromPreview)
    }
    ta.addEventListener('scroll', onEditor, { passive: true })
    pv.addEventListener('scroll', onPreview, { passive: true })
    return () => {
      ta.removeEventListener('scroll', onEditor)
      pv.removeEventListener('scroll', onPreview)
    }
  }, [taRef, previewRef, collapsed, schedule, syncFromEditor, syncFromPreview])

  // Сетка строк зависит от текста, кегля, режима переноса и ширины панели.
  useEffect(() => {
    dirty.current = true
  }, [md, settings.fontSize, settings.wordWrap])

  useEffect(() => {
    if (collapsed !== 'none') return
    const ta = taRef.current
    if (!ta || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      dirty.current = true
    })
    ro.observe(ta)
    return () => ro.disconnect()
  }, [taRef, collapsed])

  // Пересчёт сохраняет смысловую позицию ведущей панели, в том числе
  // страницу содержания. При первом открытии показываем начало документа.
  useEffect(() => {
    if (leader.current === null) return
    if (leader.current === 'preview' && previewPosition.current) {
      const position = previewPosition.current
      schedule(() => {
        const pv = previewRef.current
        if (!pv) return
        let offset: number | null = null
        if (position.kind === 'text') {
          offset = previewOffsetForLine(anchorsRef.current, position.line, rangesRef.current)
        } else {
          const matching = rangesRef.current.filter((r) => r.kind === position.kind)
          const range = matching[Math.min(position.index, matching.length - 1)]
          if (range) offset = range.start + position.fraction * (range.end - range.start)
        }
        if (offset !== null) setScroll('preview', pv, PREVIEW_PAD_TOP_PX + offset * zoomRef.current)
        else syncFromEditor()
      })
      return
    }
    schedule(syncFromEditor)
  }, [anchors, ranges, zoom, previewRef, schedule, syncFromEditor, setScroll])

  // При сворачивании DOM-узел панели удаляется, поэтому обработчики выше
  // снимаются. После разворачивания refs указывают на новый узел; сбрасываем
  // старое лидерство и восстанавливаем связь от панели, которая оставалась
  // открытой: если свернули редактор, источником является превью, и наоборот.
  useEffect(() => {
    const wasCollapsed = previousCollapsed.current
    const reopened = wasCollapsed !== 'none' && collapsed === 'none'
    previousCollapsed.current = collapsed
    if (!reopened) return
    dirty.current = true
    expected.current = { editor: null, preview: null }
    leader.current = null
    leaderUntil.current = 0
    schedule(wasCollapsed === 'editor' ? syncFromPreview : syncFromEditor)
  }, [collapsed, schedule, syncFromEditor, syncFromPreview])

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
  }, [])
}
