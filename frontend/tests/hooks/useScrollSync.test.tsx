import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollSync } from '../../src/hooks/useScrollSync'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'
import { PAGE_HEIGHT_PX, PAGE_GAP_PX, PREVIEW_PAD_TOP_PX } from '../../src/lib/pageGeometry'
import type { Anchor, Page } from '../../src/lib/paginate'

const STEP = PAGE_HEIGHT_PX + PAGE_GAP_PX
const page = (generated?: Page['generated']): Page => ({ html: '', generated })
const initial: {
  pages: Page[]
  anchors: Anchor[]
  zoom: number
  collapsed: 'none' | 'editor' | 'preview'
} = {
  pages: [page('title'), page(), page('toc'), page('toc'), page(), page(), page()],
  anchors: [{ line: 0, page: 2, y: 0 }, { line: 10, page: 2, y: 600 },
    { line: 20, page: 5, y: 0 }, { line: 200, page: 7, y: 600 }] as Anchor[],
  zoom: 1,
  collapsed: 'none' as const,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 16))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const flush = () => act(() => { vi.advanceTimersByTime(200) })

function setup() {
  const ta = document.createElement('textarea')
  const pv = document.createElement('div')
  Object.defineProperties(ta, { scrollHeight: { value: 5000 }, clientHeight: { value: 700 } })
  Object.defineProperties(pv, { scrollHeight: { value: 8200 }, clientHeight: { value: 700 } })
  const taRef: { current: HTMLTextAreaElement | null } = { current: ta }
  const previewRef: { current: HTMLDivElement | null } = { current: pv }
  const hook = renderHook((props) => useScrollSync({ ...props, taRef, previewRef,
    md: Array(201).fill('текст').join('\n'), settings: { ...DEFAULT_SETTINGS, wordWrap: false } }), { initialProps: initial })
  const scroll = (el: HTMLElement, top: number) => {
    act(() => { el.scrollTop = top; el.dispatchEvent(new Event('scroll')) })
    flush()
  }
  return { ...hook, ta, pv, taRef, previewRef, scroll }
}

describe('MVP-12: сгенерированные страницы и синхронная прокрутка', () => {
  it('открывает титульник, а первая прокрутка редактора переходит к тексту', () => {
    const { ta, pv, scroll } = setup()
    expect(pv.scrollTop).toBe(0)
    scroll(ta, 1)
    expect(pv.scrollTop).toBeGreaterThanOrEqual(PREVIEW_PAD_TOP_PX + STEP)
  })

  it('титульник и многостраничное содержание не двигают редактор; текст возобновляет связь', () => {
    const { ta, pv, scroll } = setup()
    ta.scrollTop = 450
    for (const top of [100, 2 * STEP + 300, 3 * STEP + 300]) {
      scroll(pv, top)
      expect(ta.scrollTop).toBe(450)
    }
    scroll(pv, 5 * STEP + 300)
    expect(ta.scrollTop).not.toBe(450)
  })

  it('редактор пропускает содержание и при движении вверх, и вниз', () => {
    const { ta, pv, scroll } = setup()
    for (const top of [0, 100, 200, 300, 400, 500, 400, 300, 200, 100, 0]) {
      scroll(ta, top)
      const offset = pv.scrollTop - PREVIEW_PAD_TOP_PX
      expect(offset < 2 * STEP || offset >= 4 * STEP).toBe(true)
    }
  })

  it('пересчёт и zoom сохраняют страницу содержания после истечения окна лидерства', () => {
    const { pv, ta, scroll, rerender } = setup()
    ta.scrollTop = 400
    scroll(pv, PREVIEW_PAD_TOP_PX + 3 * STEP + 250)
    rerender({ ...initial, zoom: 0.8, pages: [page('title'), page(), page(), page('toc'), page('toc'), page(), page()],
      anchors: initial.anchors.map((a) => ({ ...a, page: a.page >= 5 ? a.page + 1 : a.page })) })
    flush()
    expect(pv.scrollTop).toBeCloseTo(PREVIEW_PAD_TOP_PX + (4 * STEP + 250) * 0.8)
    expect(ta.scrollTop).toBe(400)
    act(() => { pv.dispatchEvent(new Event('scroll')) })
    flush()
    expect(ta.scrollTop).toBe(400)
  })

  it('сокращение содержания сохраняет последнюю страницу, отключение возвращает к редактору', () => {
    const { pv, ta, scroll, rerender } = setup()
    ta.scrollTop = 500
    scroll(pv, PREVIEW_PAD_TOP_PX + 3 * STEP + 250)
    rerender({ ...initial, pages: [page('title'), page(), page('toc'), page(), page(), page()] })
    flush()
    expect(pv.scrollTop).toBeCloseTo(PREVIEW_PAD_TOP_PX + 2 * STEP + 250)
    rerender({ ...initial, pages: [page('title'), page(), page(), page(), page(), page()],
      anchors: initial.anchors.map((a) => ({ ...a, page: a.page >= 5 ? a.page - 2 : a.page })) })
    flush()
    expect(ta.scrollTop).toBe(500)
    expect(Number.isFinite(pv.scrollTop)).toBe(true)
    expect(pv.scrollTop).not.toBeCloseTo(PREVIEW_PAD_TOP_PX + 2 * STEP + 250)
  })

  it('при пересчёте сохраняет строку просматриваемого текста', () => {
    const { pv, scroll, rerender } = setup()
    scroll(pv, PREVIEW_PAD_TOP_PX + 5 * STEP + 300)
    const before = pv.scrollTop
    rerender({ ...initial, anchors: initial.anchors.map((a) => ({ ...a, page: a.page + 1 })),
      pages: [page('title'), ...initial.pages] })
    flush()
    expect(pv.scrollTop).toBeCloseTo(before + STEP)
  })

  it('пустой Markdown оставляет сгенерированные страницы доступными', () => {
    const { pv, ta, scroll, rerender } = setup()
    rerender({ ...initial, anchors: [], pages: [page('title'), page('toc')] })
    scroll(pv, 400)
    expect(pv.scrollTop).toBe(400)
    expect(ta.scrollTop).toBe(0)
  })

  it('после сворачивания и открытия заново подключает scroll-события', () => {
    const { pv, taRef, previewRef, rerender } = setup()
    taRef.current = null
    previewRef.current = null
    rerender({ ...initial, collapsed: 'editor' })

    const reopenedTa = document.createElement('textarea')
    Object.defineProperties(reopenedTa, { scrollHeight: { value: 5000 }, clientHeight: { value: 700 } })
    taRef.current = reopenedTa
    previewRef.current = pv
    rerender({ ...initial, collapsed: 'none' })
    flush()

    act(() => {
      reopenedTa.scrollTop = 1
      reopenedTa.dispatchEvent(new Event('scroll'))
    })
    flush()
    expect(pv.scrollTop).toBeGreaterThanOrEqual(PREVIEW_PAD_TOP_PX + STEP)
  })

  it('при открытии редактора восстанавливает позицию, выбранную в оставшемся превью', () => {
    const { pv, taRef, previewRef, rerender } = setup()
    pv.scrollTop = PREVIEW_PAD_TOP_PX + 5 * STEP + 250
    taRef.current = null
    rerender({ ...initial, collapsed: 'editor' })

    const reopenedTa = document.createElement('textarea')
    Object.defineProperties(reopenedTa, { scrollHeight: { value: 5000 }, clientHeight: { value: 700 } })
    taRef.current = reopenedTa
    previewRef.current = pv
    rerender({ ...initial, collapsed: 'none' })
    flush()

    expect(reopenedTa.scrollTop).toBeGreaterThan(0)
  })

  it('при открытии превью восстанавливает позицию, выбранную в оставшемся редакторе', () => {
    const { ta, taRef, previewRef, rerender } = setup()
    ta.scrollTop = 1200
    previewRef.current = null
    rerender({ ...initial, collapsed: 'preview' })

    const reopenedPv = document.createElement('div')
    Object.defineProperties(reopenedPv, { scrollHeight: { value: 8200 }, clientHeight: { value: 700 } })
    taRef.current = ta
    previewRef.current = reopenedPv
    rerender({ ...initial, collapsed: 'none' })
    flush()

    expect(reopenedPv.scrollTop).toBeGreaterThan(PREVIEW_PAD_TOP_PX)
  })
})
