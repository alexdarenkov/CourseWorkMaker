/** Масштаб превью: авто-подгонка под ширину панели и ручной зум пользователя
 *  (после ручного зума авто-подгонка по ресайзу отключается — userZoomed). */
import { RefObject, useCallback, useRef, useState } from 'react'
import { PAGE_WIDTH_PX } from '../lib/pageGeometry'

/** Границы ручного масштаба превью (ползунок в тулбаре). */
export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 2

export function useZoom(previewRef: RefObject<HTMLDivElement>) {
  const [zoom, setZoom] = useState<number | null>(null)
  const userZoomed = useRef(false)

  const fitZoom = useCallback(() => {
    const el = previewRef.current
    if (!el) return
    const z = Math.max(ZOOM_MIN, Math.min(1.5, (el.clientWidth - 64) / PAGE_WIDTH_PX))
    setZoom(Math.round(z * 100) / 100)
  }, [previewRef])

  const zoomValue = zoom ?? 0.8

  return { zoom, setZoom, zoomValue, userZoomed, fitZoom }
}
