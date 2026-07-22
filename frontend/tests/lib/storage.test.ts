/**
 * Локальное хранилище: восстановление состояния редактора и JWT-токена.
 * Повреждённое/пустое хранилище тихо откатывается к образцу и дефолтам.
 */
import { describe, expect, it } from 'vitest'
import { SAMPLE_MD } from '../../src/lib/sample'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'
import { loadPersisted, loadToken, savePersisted, saveToken } from '../../src/lib/storage'

describe('loadPersisted', () => {
  it('пустое хранилище → образец документа и дефолтные настройки', () => {
    const state = loadPersisted()
    expect(state.md).toBe(SAMPLE_MD)
    expect(state.s).toEqual(DEFAULT_SETTINGS)
  })

  it('повреждённый JSON игнорируется → дефолты', () => {
    localStorage.setItem('md2docx:v1', '{сломано')
    expect(loadPersisted().md).toBe(SAMPLE_MD)
  })

  it('round-trip: savePersisted → loadPersisted', () => {
    const saved = {
      md: '# Мой текст',
      s: { ...DEFAULT_SETTINGS, fontSize: 16 },
    }
    savePersisted(saved)
    expect(loadPersisted()).toEqual(saved)
  })

  it('частичные настройки дополняются дефолтами', () => {
    localStorage.setItem('md2docx:v1', JSON.stringify({ md: 'x', s: { fontSize: 18 } }))
    const state = loadPersisted()
    expect(state.s.fontSize).toBe(18)
    expect(state.s.toc).toBe(DEFAULT_SETTINGS.toc)
  })

  it('старый формат титульника мигрируется при загрузке (GL-9)', () => {
    localStorage.setItem('md2docx:v1', JSON.stringify({ md: 'x', s: { university: 'мэи' } }))
    expect(loadPersisted().s.titleHeader).toContain('МЭИ')
  })
})

describe('токен', () => {
  it('save/load round-trip, null удаляет токен', () => {
    expect(loadToken()).toBeNull()
    saveToken('jwt-123')
    expect(loadToken()).toBe('jwt-123')
    saveToken(null)
    expect(loadToken()).toBeNull()
  })
})
