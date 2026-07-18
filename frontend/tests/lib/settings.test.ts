/**
 * Настройки документа: миграция старого формата титульника в свободные блоки
 * (GL-9, docs/specs/gost-layout.md) и целостность EDITOR_ONLY_KEYS.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, EDITOR_ONLY_KEYS, migrateSettings } from '../../src/lib/settings'

describe('GL-9: migrateSettings — старый титульник → свободные блоки', () => {
  const OLD = {
    university: 'НИУ «МЭИ»',
    department: 'Кафедра ПМИ',
    discipline: 'Проектирование ИС',
    group: 'ИВТ-21',
    student: 'Смирнова А. Д.',
    supervisor: 'Петров В. Н.',
    city: 'Москва',
    year: '2026',
  }

  it('старые поля вуза/студента собираются в titleHeader/titleWork/titlePeople/titleBottom', () => {
    const out = migrateSettings({ ...OLD }) as Record<string, string>
    expect(out.titleHeader).toContain('МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ')
    expect(out.titleHeader).toContain('НИУ «МЭИ»')
    expect(out.titleHeader).toContain('Кафедра ПМИ')
    expect(out.titleWork).toBe('КУРСОВАЯ РАБОТА\nпо дисциплине «Проектирование ИС»\nна тему:')
    expect(out.titlePeople).toContain('Выполнил: студент группы ИВТ-21')
    expect(out.titlePeople).toContain('Смирнова А. Д.')
    expect(out.titlePeople).toContain('Руководитель: Петров В. Н.')
    expect(out.titleBottom).toBe('Москва, 2026')
  })

  it('название вуза приводится к прописным', () => {
    const out = migrateSettings({ university: 'национальный университет' }) as Record<string, string>
    expect(out.titleHeader).toContain('НАЦИОНАЛЬНЫЙ УНИВЕРСИТЕТ')
  })

  it('новый формат (есть titleHeader) не трогается', () => {
    const raw = { titleHeader: 'уже мигрировано', university: 'не важно' }
    expect(migrateSettings(raw)).toBe(raw)
  })

  it('настройки без старых полей возвращаются как есть', () => {
    const raw = { fontSize: 16 }
    expect(migrateSettings(raw)).toBe(raw)
  })
})

describe('EDITOR_ONLY_KEYS', () => {
  it('каждый ключ существует в Settings (не требует перепагинации)', () => {
    for (const key of EDITOR_ONLY_KEYS) {
      expect(DEFAULT_SETTINGS).toHaveProperty(key)
    }
  })
})
