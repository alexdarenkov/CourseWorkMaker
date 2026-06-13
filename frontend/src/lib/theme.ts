import type { Settings } from './settings'

export function applyTheme(theme: Settings['theme']): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}
