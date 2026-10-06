/**
 * Каретка редактора, показанная в превью на её настоящем месте в тексте.
 *
 * Элемент ищется по метке строки (`data-l`, её ставит renderAll), а не по
 * геометрии: подпись рисунка, строка таблицы, пункт перечисления и абзац имеют
 * каждый свою метку, поэтому каретка попадает именно в то место, которое
 * написано в текущей строке markdown. Внутри найденного элемента смещение
 * считается по виду блока (lib/caretMap.ts), а координаты выдаёт Range —
 * с учётом переносов, красной строки и выравнивания по ширине.
 *
 * Всё в координатах ленты (без зума): лента масштабируется целиком, вместе с
 * кареткой.
 */
import { RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { locateCaret } from '../lib/caretLocate'
import { caretColumn, caretLine } from '../lib/caretMap'
import { parseMD } from '../lib/markdown'
import type { Page } from '../lib/paginate'

/** Положение каретки в ленте превью (px без зума). */
export interface CaretRect {
  x: number
  y: number
  h: number
}

/** Высота каретки там, где текста нет (формула, картинка): строка ГОСТ 14 пт. */
const FALLBACK_H = 32

interface Options {
  taRef: RefObject<HTMLTextAreaElement>
  stripRef: RefObject<HTMLDivElement>
  md: string
  zoom: number
  pages: Page[]
}

export function useCaretMarker({ taRef, stripRef, md, zoom, pages }: Options): CaretRect | null {
  const [rect, setRect] = useState<CaretRect | null>(null)
  // Тот же разбор, что у пагинатора, но нужны только границы блоков — держим
  // его отдельно и пересчитываем лишь на смену текста.
  const blocks = useMemo(() => parseMD(md), [md])

  const measure = useCallback(() => {
    const ta = taRef.current
    const strip = stripRef.current
    if (!ta || !strip) {
      setRect(null)
      return
    }
    const pos = ta.selectionStart
    const lines = md.split('\n')
    const spot = locateCaret(strip, blocks, lines, caretLine(md, pos), caretColumn(md, pos))
    if (!spot) {
      setRect(null)
      return
    }

    const base = strip.getBoundingClientRect()
    const z = zoom || 1
    // Каретка адресована посимвольно — координаты даёт Range по найденному
    // текстовому узлу; иначе (формула, картинка) — левый верхний угол объекта.
    let box: DOMRect | null = null
    if (spot.node) {
      const range = document.createRange()
      range.setStart(spot.node, Math.min(spot.offset ?? 0, spot.node.data.length))
      range.collapse(true)
      const r = range.getBoundingClientRect()
      if (r.height > 0) box = r
    }
    // Range схлопнулся (пустая строка) — встаём к углу самого элемента.
    const elBox = spot.el.getBoundingClientRect()
    setRect({
      x: ((box ? box.left : elBox.left) - base.left) / z,
      y: ((box ? box.top : elBox.top) - base.top) / z,
      h: (box ? box.height : Math.min(elBox.height || FALLBACK_H, FALLBACK_H)) / z,
    })
  }, [taRef, stripRef, md, blocks, zoom])

  // После перерисовки страниц (новая раскладка, другой масштаб) координаты
  // старые — меряем до кадра, чтобы каретка не мигала на прежнем месте.
  useLayoutEffect(() => {
    measure()
  }, [measure, pages])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    const onSel = () => {
      if (document.activeElement === ta) measure()
    }
    // selectionchange покрывает и клик, и стрелки, и ввод, но для textarea
    // появился не во всех браузерах — подстраховываемся событиями элемента.
    document.addEventListener('selectionchange', onSel)
    ta.addEventListener('keyup', measure)
    ta.addEventListener('click', measure)
    ta.addEventListener('focus', measure)
    return () => {
      document.removeEventListener('selectionchange', onSel)
      ta.removeEventListener('keyup', measure)
      ta.removeEventListener('click', measure)
      ta.removeEventListener('focus', measure)
    }
  }, [taRef, measure])

  return rect
}
