/**
 * Экспорт .zip: переписывание ссылок asset:… на images/…, упаковка fflate,
 * round-trip обратно через unzipSync (архив снова импортируем).
 */
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildZipExport, dataUrlToBytes, safeFileName } from '../../src/lib/docExport'

// Валидный однопиксельный PNG.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_URL = 'data:image/png;base64,' + PNG_B64

describe('safeFileName', () => {
  it('вырезает запрещённые символы, пустое имя — «Курсовая работа»', () => {
    expect(safeFileName('Отчёт: версия 2/3?')).toBe('Отчёт_ версия 2_3_')
    expect(safeFileName('')).toBe('Курсовая работа')
  })
})

describe('dataUrlToBytes', () => {
  it('декодирует картинку, jpeg получает расширение jpg', () => {
    const png = dataUrlToBytes(PNG_URL)!
    expect(png.ext).toBe('png')
    // Сигнатура PNG.
    expect([...png.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(dataUrlToBytes('data:image/jpeg;base64,' + PNG_B64)?.ext).toBe('jpg')
  })

  it('не картинка или битый base64 → null', () => {
    expect(dataUrlToBytes('data:text/plain;base64,eA==')).toBeNull()
    expect(dataUrlToBytes('data:image/png;base64,@@@не-base64@@@')).toBeNull()
  })
})

describe('buildZipExport', () => {
  it('round-trip: ссылки переписаны на images/…, файлы лежат в архиве', async () => {
    const md = 'Рисунок: Схема\n![Схема](asset:img-1)\n\nТекст.'
    const { blob, safeName } = await buildZipExport(md, 'Отчёт/2026', { 'asset:img-1': PNG_URL })
    expect(safeName).toBe('Отчёт_2026')

    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(entries).sort()).toEqual(['images/img-1.png', 'Отчёт_2026.md'].sort())
    const outMd = new TextDecoder().decode(entries['Отчёт_2026.md'])
    expect(outMd).toContain('![Схема](images/img-1.png)')
    expect(outMd).not.toContain('asset:img-1')
    expect([...entries['images/img-1.png'].slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('битый ассет пропускается, ссылка остаётся как была', async () => {
    const md = '![х](asset:img-2)'
    const { blob } = await buildZipExport(md, 'Т', { 'asset:img-2': 'data:image/png;base64,@@@' })
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(entries)).toEqual(['Т.md'])
    expect(new TextDecoder().decode(entries['Т.md'])).toContain('asset:img-2')
  })
})
