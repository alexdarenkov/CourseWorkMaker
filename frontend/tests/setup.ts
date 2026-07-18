/**
 * Общий setup vitest: матчеры jest-dom и рабочий localStorage.
 *
 * В vitest 4 + happy-dom штатного Storage нет: глобальный `localStorage` —
 * Node-овский экспериментальный Web Storage без `--localstorage-file`
 * (getItem/setItem есть, clear нет), а `window.localStorage` — вообще пустой
 * объект. Подменяем оба на общий in-memory Storage и чистим его перед каждым
 * тестом.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Автоочистка RTL не включается сама (нужны vitest globals) — чистим явно,
// иначе деревья предыдущих тестов остаются в DOM.
afterEach(cleanup)

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => {
      data.clear()
    },
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => {
      data.delete(k)
    },
    setItem: (k: string, v: string) => {
      data.set(k, String(v))
    },
  } as Storage
}

const memoryStorage = createMemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true })
Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true })

beforeEach(() => {
  memoryStorage.clear()
})
