import { validateSettings } from './settingsValidation'
import { DEFAULT_SETTINGS, Settings } from './settings'
import { SAMPLE_MD } from './sample'

const KEY = 'md2docx:v1'

export interface PersistedState {
  md: string
  s: Settings
}

// Резерв в памяти переживает SPA-навигацию, если localStorage переполнен.
// После закрытия/перезагрузки вкладки он исчезнет — beforeunload предупреждает об этом.
let unsavedDraft: PersistedState | null = null

export function hasUnsavedDraft(): boolean {
  return unsavedDraft !== null
}

export function loadEditorDraft(): PersistedState {
  return unsavedDraft ? { md: unsavedDraft.md, s: { ...unsavedDraft.s } } : loadPersisted()
}

// Предупреждение действует и после ухода из редактора на другие страницы SPA.
window.addEventListener('beforeunload', event => {
  if (!unsavedDraft) return
  event.preventDefault()
  event.returnValue = ''
})

export function loadPersisted(): PersistedState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (raw) {
      // Ошибка настроек не должна уничтожать восстановимый текст документа.
      let settings = { ...DEFAULT_SETTINGS }
      try { settings = validateSettings(raw.s ?? {}) } catch { /* оставляем значения по умолчанию */ }
      return {
        md: typeof raw.md === 'string' ? raw.md : SAMPLE_MD,
        s: settings,
      }
    }
  } catch {
    /* повреждённое хранилище игнорируем */
  }
  return { md: SAMPLE_MD, s: { ...DEFAULT_SETTINGS } }
}

export function savePersisted(state: PersistedState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    unsavedDraft = null
    return true
  } catch {
    unsavedDraft = { md: state.md, s: { ...state.s } }
    return false
  }
}

