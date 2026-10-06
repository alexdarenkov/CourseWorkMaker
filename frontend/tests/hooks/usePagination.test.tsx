import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { usePagination } from '../../src/hooks/usePagination'
import { paginate } from '../../src/lib/paginate'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'

vi.mock('../../src/lib/paginate', () => ({ paginate: vi.fn(() => ({ pages: [], anchors: [] })) }))
vi.mock('../../src/lib/mermaidRenderer', () => ({ getMermaidSvg: vi.fn() }))
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('MVP-14 — пересчитывает после загрузки шрифта; поздние callbacks не оживляют закрытый редактор', async () => {
  vi.useFakeTimers()
  const fonts = new EventTarget()
  Object.defineProperty(fonts, 'ready', { value: Promise.resolve(fonts) })
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
  const stateRef = { current: { md: 'Первый текст', settings: DEFAULT_SETTINGS } }
  const { result, unmount } = renderHook(() => usePagination(stateRef))
  await act(async () => {})
  act(() => vi.advanceTimersByTime(180))
  vi.mocked(paginate).mockClear()
  stateRef.current.md = 'Актуальный текст'
  act(() => fonts.dispatchEvent(new Event('loadingdone')))
  act(() => vi.advanceTimersByTime(180))
  expect(paginate).toHaveBeenCalledWith('Актуальный текст', DEFAULT_SETTINGS, expect.any(Function), expect.any(Function))
  const late = result.current.schedulePaginate
  act(() => late())
  unmount()
  vi.mocked(paginate).mockClear()
  act(() => { late(); fonts.dispatchEvent(new Event('loadingdone')); vi.advanceTimersByTime(1000) })
  expect(paginate).not.toHaveBeenCalled()
})
