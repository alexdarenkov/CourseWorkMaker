/**
 * Smoke-тест тестовой инфраструктуры: setup.ts подменяет неполный localStorage
 * среды (vitest 4 + happy-dom) на in-memory Storage — общий для глобального
 * `localStorage` и `window.localStorage`, чистый перед каждым тестом.
 */
import { expect, it } from 'vitest'

it('localStorage — полноценный Storage, чистый перед тестом', () => {
  expect(typeof window.localStorage.clear).toBe('function')
  expect(window.localStorage.length).toBe(0)
  localStorage.setItem('x', '1')
  expect(localStorage.getItem('x')).toBe('1')
  expect(window.localStorage.getItem('x')).toBe('1')
  localStorage.removeItem('x')
  expect(localStorage.getItem('x')).toBeNull()
})
