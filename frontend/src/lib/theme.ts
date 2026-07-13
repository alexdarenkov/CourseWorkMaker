import type { Settings } from './settings'

const mq =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

/** Фактическая тема: 'auto' следует за системной. */
export function effectiveTheme(theme: Settings['theme']): 'light' | 'dark' {
  return theme === 'auto' ? (mq?.matches ? 'dark' : 'light') : theme
}

export function applyTheme(theme: Settings['theme']): void {
  document.documentElement.classList.toggle('dark', effectiveTheme(theme) === 'dark')
}

/** Подписка на смену системной темы (для theme === 'auto'). Возвращает отписку. */
export function onSystemThemeChange(cb: () => void): () => void {
  if (!mq) return () => {}
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
