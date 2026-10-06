import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useDocPersistence } from '../../src/hooks/useDocPersistence'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'
import { loadPersisted, savePersisted } from '../../src/lib/storage'
import { addRawAsset, getAsset } from '../../src/lib/assets'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

it('ошибка квоты не сообщает об успешном сохранении и сохраняет прежний документ', () => {
  savePersisted({ md: 'старый', s: DEFAULT_SETTINGS })
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
  const showToast = vi.fn()
  const { result } = renderHook(() => useDocPersistence({ stateRef: { current: { md: 'новый', settings: DEFAULT_SETTINGS } }, showToast }))
  act(() => result.current.manualSave())
  expect(result.current.saveStatus).toContain('Не сохранено')
  expect(showToast).not.toHaveBeenCalledWith('Документ сохранён')
  expect(loadPersisted().md).toBe('старый')
})

it('автосохранение не удаляет картинки, которые может восстановить Undo', () => {
  const key = addRawAsset('data:image/png;base64,YQ==')
  const ref = { current: { md: '', settings: DEFAULT_SETTINGS } }
  const { result } = renderHook(() => useDocPersistence({ stateRef: ref, showToast: vi.fn() }))
  act(() => result.current.persistNow())
  expect(getAsset(key)).toBe('data:image/png;base64,YQ==')
})

it('уход до истечения debounce сохраняет последние изменения', () => {
  vi.useFakeTimers()
  const ref = { current: { md: 'новый текст', settings: DEFAULT_SETTINGS } }
  const { result, unmount } = renderHook(() => useDocPersistence({ stateRef: ref, showToast: vi.fn() }))
  act(() => result.current.scheduleSave())
  unmount()
  expect(loadPersisted().md).toBe('новый текст')
  expect(vi.getTimerCount()).toBe(0)
})
