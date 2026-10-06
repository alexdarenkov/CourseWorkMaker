/** Пагинация превью: немедленный пересчёт и дебаунс 180 мс на ввод.
 *  Mermaid рендерится асинхронно — по готовности SVG/размеров картинок
 *  пагинатор перезапускается сам (колбэки onReady). */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getMermaidSvg } from '../lib/mermaidRenderer'
import { Anchor, Page, paginate } from '../lib/paginate'
import type { Settings } from '../lib/settings'

export function usePagination(stateRef: { current: { md: string; settings: Settings } }) {
  const [pages, setPages] = useState<Page[]>([])
  // Якоря «строка markdown → страница» той же раскладки — для синхронной
  // прокрутки (useScrollSync).
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const paginateTimer = useRef<number | null>(null)
  const mounted = useRef(true)

  const doPaginate = useCallback(() => {
    if (!mounted.current) return
    const { md: m, settings: s } = stateRef.current
    const res = paginate(
      m,
      s,
      (code) => getMermaidSvg(code, () => schedulePaginate()),
      () => schedulePaginate(),
    )
    setPages(res.pages)
    setAnchors(res.anchors)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const schedulePaginate = useCallback(() => {
    if (!mounted.current) return
    if (paginateTimer.current) window.clearTimeout(paginateTimer.current)
    paginateTimer.current = window.setTimeout(doPaginate, 180)
  }, [doPaginate])

  useEffect(() => {
    mounted.current = true
    // KaTeX запрашивает шрифты лишь после вставки формулы в DOM. Первое
    // document.fonts.ready до рендера не покрывает эту загрузку.
    document.fonts?.addEventListener('loadingdone', schedulePaginate)
    document.fonts?.addEventListener('loadingerror', schedulePaginate)
    void document.fonts?.ready.then(schedulePaginate)
    return () => {
      mounted.current = false
      if (paginateTimer.current) window.clearTimeout(paginateTimer.current)
      document.fonts?.removeEventListener('loadingdone', schedulePaginate)
      document.fonts?.removeEventListener('loadingerror', schedulePaginate)
    }
  }, [schedulePaginate])

  return { pages, anchors, doPaginate, schedulePaginate }
}
