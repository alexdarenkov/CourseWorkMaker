import { DEFAULT_SETTINGS, Settings } from './settings'
import { SAMPLE_MD } from './sample'

const KEY = 'md2docx:v1'

export interface PersistedState {
  md: string
  docName: string
  s: Settings
}

export function loadPersisted(): PersistedState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (raw) {
      return {
        md: typeof raw.md === 'string' ? raw.md : SAMPLE_MD,
        docName: raw.docName || 'Курсовая работа',
        s: { ...DEFAULT_SETTINGS, ...(raw.s || {}) },
      }
    }
  } catch {
    /* повреждённое хранилище игнорируем */
  }
  return { md: SAMPLE_MD, docName: 'Курсовая работа', s: { ...DEFAULT_SETTINGS } }
}

export function savePersisted(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* квота/приватный режим */
  }
}

const TOKEN_KEY = 'md2docx:token'

export function loadToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function saveToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}
