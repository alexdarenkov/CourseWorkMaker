import { DEFAULT_SETTINGS, EDITOR_FONT_PX_MAX, EDITOR_FONT_PX_MIN, migrateSettings, Settings } from './settings'

/** Принимаем только известные настройки и значения подходящих типов. */
export function validateSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Некорректные настройки документа')
  const source = migrateSettings(raw as Record<string, unknown>) as Record<string, unknown>
  const settings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(settings) as (keyof Settings)[]) {
    const value = source[key]
    if (value === undefined) continue
    if (typeof value !== typeof settings[key]) throw new Error(`Некорректная настройка: ${key}`)
    if (typeof value === 'string' && value.length > 10000) throw new Error('Слишком длинная настройка документа')
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Некорректное число в настройках')
    Object.assign(settings, { [key]: value })
  }
  if (!['auto', 'light', 'dark'].includes(settings.theme)) throw new Error('Некорректная тема оформления')
  if (settings.fontSize < EDITOR_FONT_PX_MIN || settings.fontSize > EDITOR_FONT_PX_MAX || settings.targetPages < 1 || settings.targetPages > 1000) throw new Error('Настройки вне допустимого диапазона')
  return settings
}

