/**
 * Пересчёт позиций для синхронной прокрутки редактора и превью.
 *
 * Обе стороны сводятся к общей «валюте» — ДРОБНОМУ номеру строки markdown:
 * редактор переводит свой scrollTop в строку, превью — строку в смещение по
 * ленте страниц (и обратно). Промежуточные точки берутся линейной
 * интерполяцией между соседними якорями, которые пагинатор расставляет по
 * началам блоков (см. Anchor в paginate.ts).
 *
 * Здесь только арифметика — DOM трогает хук useScrollSync.
 */

import type { Anchor } from './paginate'
import { PAGE_GAP_PX, PAGE_HEIGHT_PX, PAGE_PAD_TOP_PX } from './pageGeometry'

/**
 * Разметка строк редактора. offsets — смещения строк (px от верха первой
 * строки), нужны при включённом переносе, когда строки разной высоты; null —
 * строки равной высоты (перенос выключен), сетка считается умножением.
 */
export interface EditorMetrics {
  lineHeight: number
  offsets: number[] | null
}

/** Смещение якоря от верха ленты превью в px (без учёта зума). */
export function anchorOffset(a: Anchor): number {
  return (a.page - 1) * (PAGE_HEIGHT_PX + PAGE_GAP_PX) + PAGE_PAD_TOP_PX + a.y
}

/** Индекс последнего элемента, у которого key(el) <= v (или 0, если таких нет). */
function lastAtMost<T>(arr: T[], key: (el: T) => number, v: number): number {
  let lo = 0
  let hi = arr.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (key(arr[mid]) <= v) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Доля v на отрезке [a, b]; вырожденный отрезок — 0 (защита от деления на 0). */
function frac(a: number, b: number, v: number): number {
  return b > a ? (v - a) / (b - a) : 0
}

/**
 * Смещение в ленте превью (px, без зума) для дробной строки markdown.
 * null — якорей нет (пустой документ): прокручивать не к чему.
 */
export function previewOffsetForLine(anchors: Anchor[], line: number): number | null {
  if (anchors.length === 0) return null
  const first = anchors[0]
  // Выше первого и ниже последнего якоря интерполировать не по чему: строки
  // перед первым блоком (и после последнего) в превью ничего не занимают.
  if (line <= first.line) return anchorOffset(first)
  const last = anchors[anchors.length - 1]
  if (line >= last.line) return anchorOffset(last)
  const i = lastAtMost(anchors, (a) => a.line, line)
  const a = anchors[i]
  const b = anchors[i + 1] ?? a
  const oa = anchorOffset(a)
  return oa + frac(a.line, b.line, line) * (anchorOffset(b) - oa)
}

/** Обратное отображение: смещение в ленте превью (px, без зума) → строка markdown. */
export function lineForPreviewOffset(anchors: Anchor[], offset: number): number | null {
  if (anchors.length === 0) return null
  const first = anchors[0]
  if (offset <= anchorOffset(first)) return first.line
  const last = anchors[anchors.length - 1]
  if (offset >= anchorOffset(last)) return last.line
  const i = lastAtMost(anchors, anchorOffset, offset)
  const a = anchors[i]
  const b = anchors[i + 1] ?? a
  return a.line + frac(anchorOffset(a), anchorOffset(b), offset) * (b.line - a.line)
}

/**
 * Ход прокрутки у края, на котором отображение притягивается к краю ведомой
 * панели. Без притяжения края не сходятся: строке 0 соответствует не верх
 * ленты, а первая страница ТЕКСТА (до неё титульный лист и содержание), а
 * в самом низу редактора верхняя видимая строка — не последняя строка
 * документа, и «долистал до конца» в одной панели не значит того же в другой.
 */
const EDGE_PX = 200

/**
 * Приводит вычисленную позицию ведомой панели к её краям: у самого верха
 * ведущей отдаёт 0, у самого низа — targetMax, а на подходе к краю плавно
 * (линейно) переводит одно в другое, чтобы не было скачка.
 *
 *   target    — позиция, посчитанная по якорям;
 *   pos/max   — прокрутка ведущей панели и её максимум;
 *   targetMax — максимум прокрутки ведомой.
 */
export function blendEdges(target: number, pos: number, max: number, targetMax: number): number {
  if (max <= 0 || targetMax <= 0) return 0
  const t = Math.max(0, Math.min(targetMax, target))
  // Зона притяжения не может быть шире половины хода — иначе верхняя и нижняя
  // накладываются и отображение перестаёт быть монотонным.
  const edge = Math.min(EDGE_PX, max / 2)
  if (edge <= 0) return t
  if (pos < edge) return (pos / edge) * t
  const toEnd = max - pos
  if (toEnd < edge) return t + (1 - toEnd / edge) * (targetMax - t)
  return t
}

/** Смещение (px от верха первой строки) → дробный номер строки редактора. */
export function lineAtEditorOffset(m: EditorMetrics, top: number): number {
  if (top <= 0) return 0
  const off = m.offsets
  if (!off || off.length === 0) return top / m.lineHeight
  const lastTop = off[off.length - 1]
  // Ниже последней строки: продолжаем равномерной сеткой, иначе прокрутка
  // «залипает» на последней строке.
  if (top >= lastTop) return off.length - 1 + (top - lastTop) / m.lineHeight
  const i = lastAtMost(off, (v) => v, top)
  return i + frac(off[i], off[i + 1] ?? off[i] + m.lineHeight, top)
}

/** Дробный номер строки редактора → смещение (px от верха первой строки). */
export function editorOffsetForLine(m: EditorMetrics, line: number): number {
  if (line <= 0) return 0
  const off = m.offsets
  if (!off || off.length === 0) return line * m.lineHeight
  const i = Math.floor(line)
  if (i >= off.length - 1) {
    return off[off.length - 1] + (line - (off.length - 1)) * m.lineHeight
  }
  return off[i] + (line - i) * ((off[i + 1] ?? off[i] + m.lineHeight) - off[i])
}
