/** Имя скачиваемого файла: чистка запрещённых символов, фолбэк. */
import { describe, expect, it } from 'vitest'
import { safeFileName } from '../../src/lib/docExport'

describe('safeFileName', () => {
  it('вырезает запрещённые символы Windows/macOS', () => {
    expect(safeFileName('Отчёт: версия 2/3?')).toBe('Отчёт_ версия 2_3_')
  })

  it('пустое имя → фолбэк', () => {
    expect(safeFileName('')).toBe('Курсовая работа')
  })
})
