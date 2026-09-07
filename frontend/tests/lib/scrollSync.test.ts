/**
 * Синхронная прокрутка редактора и превью: арифметика отображения
 * «строка markdown ↔ смещение в ленте страниц» (lib/scrollSync.ts).
 *
 * Пункт спеки для этой фичи ещё не заведён — когда появится, ID нужно
 * проставить в названия describe (трассировка спека↔тест).
 *
 * Реальную раскладку (какая строка на какой странице) happy-dom не считает:
 * якоря строит пагинатор по измеренным высотам, здесь они задаются вручную.
 */
import { describe, expect, it } from 'vitest'
import { PAGE_GAP_PX, PAGE_HEIGHT_PX, PAGE_PAD_TOP_PX } from '../../src/lib/pageGeometry'
import type { Anchor } from '../../src/lib/paginate'
import {
  anchorOffset,
  blendEdges,
  editorOffsetForLine,
  lineAtEditorOffset,
  lineForPreviewOffset,
  previewOffsetForLine,
} from '../../src/lib/scrollSync'

const STEP = PAGE_HEIGHT_PX + PAGE_GAP_PX

/** Строка 0 — верх 3-й страницы, строка 10 — 200px ниже, строка 20 — 4-я страница. */
const ANCHORS: Anchor[] = [
  { line: 0, page: 3, y: 0 },
  { line: 10, page: 3, y: 200 },
  { line: 20, page: 4, y: 0 },
]

describe('scrollSync: строка markdown → лента превью', () => {
  it('якорь переводится в абсолютное смещение с учётом верхнего поля листа', () => {
    expect(anchorOffset({ line: 0, page: 1, y: 0 })).toBeCloseTo(PAGE_PAD_TOP_PX, 5)
    expect(anchorOffset({ line: 0, page: 3, y: 200 })).toBeCloseTo(2 * STEP + PAGE_PAD_TOP_PX + 200, 5)
  })

  it('в точке якоря даёт ровно его смещение', () => {
    expect(previewOffsetForLine(ANCHORS, 10)).toBeCloseTo(2 * STEP + PAGE_PAD_TOP_PX + 200, 5)
    expect(previewOffsetForLine(ANCHORS, 20)).toBeCloseTo(3 * STEP + PAGE_PAD_TOP_PX, 5)
  })

  it('между якорями интерполирует линейно', () => {
    // Середина отрезка строк 0…10 — середина отрезка 0…200 px той же страницы.
    expect(previewOffsetForLine(ANCHORS, 5)).toBeCloseTo(2 * STEP + PAGE_PAD_TOP_PX + 100, 5)
  })

  it('интерполяция через границу страницы учитывает зазор между листами', () => {
    // Строка 15 — половина пути от (стр. 3, y=200) до (стр. 4, y=0).
    const a = 2 * STEP + PAGE_PAD_TOP_PX + 200
    const b = 3 * STEP + PAGE_PAD_TOP_PX
    expect(previewOffsetForLine(ANCHORS, 15)).toBeCloseTo((a + b) / 2, 5)
  })

  it('за пределами якорей прижимается к крайним', () => {
    expect(previewOffsetForLine(ANCHORS, -5)).toBeCloseTo(anchorOffset(ANCHORS[0]), 5)
    expect(previewOffsetForLine(ANCHORS, 999)).toBeCloseTo(anchorOffset(ANCHORS[2]), 5)
  })

  it('без якорей (пустой документ) прокручивать некуда', () => {
    expect(previewOffsetForLine([], 3)).toBeNull()
    expect(lineForPreviewOffset([], 100)).toBeNull()
  })
})

describe('scrollSync: лента превью → строка markdown', () => {
  it('обратное отображение возвращает исходную строку', () => {
    for (const line of [0, 3, 10, 14, 20]) {
      const off = previewOffsetForLine(ANCHORS, line)!
      expect(lineForPreviewOffset(ANCHORS, off)).toBeCloseTo(line, 5)
    }
  })

  it('выше первого и ниже последнего якоря прижимается к крайним строкам', () => {
    expect(lineForPreviewOffset(ANCHORS, 0)).toBe(0)
    expect(lineForPreviewOffset(ANCHORS, 10 * STEP)).toBe(20)
  })
})

describe('scrollSync: сетка строк редактора', () => {
  const even = { lineHeight: 20, offsets: null }
  // Перенос включён: строка 1 занимает три визуальные (60 px), остальные — одну.
  const wrapped = { lineHeight: 20, offsets: [0, 20, 80, 100] }

  it('без переноса строка считается делением на высоту строки', () => {
    expect(lineAtEditorOffset(even, 50)).toBeCloseTo(2.5, 5)
    expect(editorOffsetForLine(even, 2.5)).toBeCloseTo(50, 5)
  })

  it('отрицательное смещение (перескролл вверх) — нулевая строка', () => {
    expect(lineAtEditorOffset(even, -30)).toBe(0)
    expect(editorOffsetForLine(even, -1)).toBe(0)
  })

  it('с переносом высокая строка отдаёт дробную позицию внутри себя', () => {
    expect(lineAtEditorOffset(wrapped, 20)).toBeCloseTo(1, 5)
    expect(lineAtEditorOffset(wrapped, 50)).toBeCloseTo(1.5, 5)
    expect(lineAtEditorOffset(wrapped, 80)).toBeCloseTo(2, 5)
  })

  it('с переносом отображение обратимо', () => {
    for (const line of [0, 0.5, 1, 1.5, 2, 3]) {
      expect(lineAtEditorOffset(wrapped, editorOffsetForLine(wrapped, line))).toBeCloseTo(line, 5)
    }
  })

  it('ниже последней строки продолжает равномерной сеткой (не залипает)', () => {
    expect(lineAtEditorOffset(wrapped, 140)).toBeCloseTo(5, 5)
    expect(editorOffsetForLine(wrapped, 5)).toBeCloseTo(140, 5)
  })
})

describe('scrollSync: сведение краёв', () => {
  // Ведущая панель: ход 2000 px; ведомая: ход 5000 px.
  const MAX = 2000
  const TMAX = 5000

  it('в самом верху ведомая панель — в нуле, даже если якорь ниже', () => {
    expect(blendEdges(900, 0, MAX, TMAX)).toBe(0)
  })

  it('в самом низу ведомая панель — в своём максимуме', () => {
    expect(blendEdges(3000, MAX, MAX, TMAX)).toBe(TMAX)
  })

  it('в середине отдаёт позицию по якорям без изменений', () => {
    expect(blendEdges(2500, 1000, MAX, TMAX)).toBe(2500)
  })

  it('на границе зоны притяжения совпадает с неизменённой позицией (нет скачка)', () => {
    expect(blendEdges(2500, 200, MAX, TMAX)).toBeCloseTo(2500, 5)
    expect(blendEdges(2500, MAX - 200, MAX, TMAX)).toBeCloseTo(2500, 5)
  })

  it('внутри зоны переводит одно в другое линейно', () => {
    // Половина верхней зоны — половина пути от 0 к позиции по якорям.
    expect(blendEdges(2500, 100, MAX, TMAX)).toBeCloseTo(1250, 5)
    // Половина нижней — половина пути от позиции по якорям к максимуму.
    expect(blendEdges(2500, MAX - 100, MAX, TMAX)).toBeCloseTo(3750, 5)
  })

  it('позиция за пределами хода ведомой панели обрезается', () => {
    expect(blendEdges(99999, 1000, MAX, TMAX)).toBe(TMAX)
    expect(blendEdges(-500, 1000, MAX, TMAX)).toBe(0)
  })

  it('непрокручиваемая панель (документ в один экран) — ноль', () => {
    expect(blendEdges(300, 0, 0, TMAX)).toBe(0)
    expect(blendEdges(300, 100, MAX, 0)).toBe(0)
  })

  it('короткий ход: зона притяжения не шире половины, отображение монотонно', () => {
    const short = 100
    let prev = -1
    for (let pos = 0; pos <= short; pos += 10) {
      const v = blendEdges(TMAX / 2, pos, short, TMAX)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(blendEdges(TMAX / 2, short, short, TMAX)).toBe(TMAX)
  })
})
