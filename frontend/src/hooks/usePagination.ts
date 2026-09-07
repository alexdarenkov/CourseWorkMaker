/** Пагинация превью: немедленный пересчёт и дебаунс 180 мс на ввод.
 *  Mermaid рендерится асинхронно — по готовности SVG/размеров картинок
 *  пагинатор перезапускается сам (колбэки onReady). */
import { useCallback, useRef, useState } from 'react'
import { getMermaidSvg } from '../lib/mermaidRenderer'
import { Anchor, Page, paginate } from '../lib/paginate'
import type { Settings } from '../lib/settings'

export function usePagination(stateRef: { current: { md: string; settings: Settings } }) {
  const [pages, setPages] = useState<Page[]>([])
  // Якоря «строка markdown → страница» той же раскладки — для синхронной
  // прокрутки (useScrollSync).
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const paginateTimer = useRef<number | null>(null)

  const doPaginate = useCallback(() => {
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
    if (paginateTimer.current) window.clearTimeout(paginateTimer.current)
    paginateTimer.current = window.setTimeout(doPaginate, 180)
  }, [doPaginate])

  return { pages, anchors, doPaginate, schedulePaginate }
}
