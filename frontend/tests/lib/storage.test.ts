/**
 * Локальное хранилище: восстановление состояния редактора и JWT-токена.
 * Повреждённое/пустое хранилище тихо откатывается к образцу и дефолтам.
 */
import { describe, expect, it } from 'vitest'
import { SAMPLE_MD } from '../../src/lib/sample'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'
import { loadPersisted, savePersisted } from '../../src/lib/storage'

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
      s: { ...DEFAULT_SETTINGS, fontSize: 15 },
    }
    savePersisted(saved)
    expect(loadPersisted()).toEqual(saved)
  })

  it('частичные настройки дополняются дефолтами', () => {
    localStorage.setItem('md2docx:v1', JSON.stringify({ md: 'x', s: { fontSize: 15 } }))
    const state = loadPersisted()
    expect(state.s.fontSize).toBe(15)
    expect(state.s.toc).toBe(DEFAULT_SETTINGS.toc)
  })

  it('старый формат титульника мигрируется при загрузке (GL-9)', () => {
    localStorage.setItem('md2docx:v1', JSON.stringify({ md: 'x', s: { university: 'мэи' } }))
    expect(loadPersisted().s.titleHeader).toContain('МЭИ')
  })
})

it('восстанавливает текст даже при повреждённых настройках', () => {
  localStorage.setItem('md2docx:v1', JSON.stringify({ md: 'Моя работа', s: { topic: {}, fontSize: 'x' } }))
  expect(loadPersisted()).toEqual({ md: 'Моя работа', s: DEFAULT_SETTINGS })
})

it('мигрирует старый титульник и отбрасывает неизвестные поля', () => {
  localStorage.setItem('md2docx:v1', JSON.stringify({ md: 'Текст', s: { university: 'Вуз', student: 'Иван', unknown: true } }))
  expect(loadPersisted().s.titleHeader).toContain('ВУЗ')
  expect(loadPersisted().s).not.toHaveProperty('unknown')
})

it('при квоте удерживает черновик в памяти для повторного открытия редактора', async () => {
  const { savePersisted, hasUnsavedDraft, loadEditorDraft } = await import('../../src/lib/storage')
  const { vi } = await import('vitest')
  const state = { md: 'Несохранённая работа', s: { ...DEFAULT_SETTINGS } }
  const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
  try {
    expect(savePersisted(state)).toBe(false)
    expect(loadEditorDraft()).toEqual(state)
    expect(hasUnsavedDraft()).toBe(true)
  } finally {
    spy.mockRestore()
  }
  expect(savePersisted(state)).toBe(true)
  expect(hasUnsavedDraft()).toBe(false)
})

it('кегль из прежней шкалы 12…18 px приводится к 11…16, остальные настройки сохраняются', () => {
  localStorage.setItem('md2docx:v1', JSON.stringify({ md: 'Текст', s: { fontSize: 18, toc: false } }))
  expect(loadPersisted().s).toEqual({ ...DEFAULT_SETTINGS, fontSize: 16, toc: false })
})

it('по умолчанию кегль редактора — 13 px', () => {
  expect(DEFAULT_SETTINGS.fontSize).toBe(13)
})
