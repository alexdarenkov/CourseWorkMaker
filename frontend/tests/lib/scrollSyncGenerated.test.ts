import { describe, expect, it } from 'vitest'
import { paginate } from '../../src/lib/paginate'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'
import { generatedRanges, lineForPreviewOffset, previewOffsetForLine } from '../../src/lib/scrollSync'
import { PAGE_HEIGHT_PX, PAGE_GAP_PX } from '../../src/lib/pageGeometry'

const STEP = PAGE_HEIGHT_PX + PAGE_GAP_PX

describe('MVP-12: разрывы соответствия Markdown и превью', () => {
  it('пагинатор помечает титульник и содержание после реферата без изменения HTML', () => {
    const { pages, anchors } = paginate('# РЕФЕРАТ\n\nТекст реферата.\n\n# ВВЕДЕНИЕ\n\nОсновной текст.',
      { ...DEFAULT_SETTINGS, titlePage: true, toc: true }, () => '')
    expect(pages.map((p) => p.generated)).toEqual(['title', undefined, 'toc', undefined])
    expect(anchors[0].page).toBe(2)
    expect(anchors.find((a) => a.line === 4)?.page).toBe(4)
  })

  it('интерполяция обратима на тексте и никогда не попадает внутрь содержания', () => {
    const anchors = [{ line: 0, page: 2, y: 0 }, { line: 10, page: 2, y: 600 },
      { line: 20, page: 5, y: 0 }, { line: 30, page: 5, y: 400 }]
    const ranges = generatedRanges([{ html: '', generated: 'title' }, { html: '' },
      { html: '', generated: 'toc' }, { html: '', generated: 'toc' }, { html: '' }])
    for (let line = 0; line <= 30; line += 0.1) {
      const offset = previewOffsetForLine(anchors, line, ranges)!
      expect(offset < 2 * STEP || offset >= 4 * STEP).toBe(true)
      expect(lineForPreviewOffset(anchors, offset, ranges)).toBeCloseTo(line, 6)
    }
    for (const offset of [0, 100, 2 * STEP, 3 * STEP, 4 * STEP - 1]) {
      expect(lineForPreviewOffset(anchors, offset, ranges)).toBeNull()
    }
  })
})
