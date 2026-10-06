import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { buildDocumentArchive, readDocumentArchive, unpackArchive } from '../../src/lib/docArchive'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'

beforeEach(() => vi.resetModules())
afterEach(() => vi.restoreAllMocks())

it('ZIP переносит текст, настройки и логотип без обращения к сети', async () => {
  // Модуль архива и хранилища должен видеть один экземпляр ассетов.
  const { addRawAsset } = await import('../../src/lib/assets')
  const { buildDocumentArchive: build, readDocumentArchive: read } = await import('../../src/lib/docArchive')
  const key = addRawAsset('data:image/png;base64,YQ==')
  const settings = { ...DEFAULT_SETTINGS, topic: 'Работа', titleLogo: key, toc: false }
  const archive = build(`# Работа\n![График](${key})`, settings)
  const entries = await unpackArchive(archive)
  expect(entries['document.md']).toBeDefined()
  const result = read(entries)!
  expect(result.settings.topic).toBe('Работа')
  expect(result.settings.toc).toBe(false)
  expect(result.md).toContain(result.settings.titleLogo)
  expect(result.assets[result.settings.titleLogo]).toBe('data:image/png;base64,YQ==')
  expect(result.settings.titleLogo).not.toBe(key)
})

it('обычный ZIP без manifest остаётся совместимым с импортом Markdown', async () => {
  expect(readDocumentArchive(await unpackArchive(zipSync({ 'report.md': strToU8('# Текст') })))).toBeNull()
})

it('не принимает будущий формат или неверные типы настроек', () => {
  const entry = (data: object) => ({ 'document.md': strToU8('x'), 'document.json': strToU8(JSON.stringify(data)) })
  expect(() => readDocumentArchive(entry({ version: 2, images: [], settings: {} }))).toThrow()
  expect(() => readDocumentArchive(entry({ version: 1, images: [], settings: { toc: 'false' } }))).toThrow()
})

it('отклоняет слишком много файлов до распаковки', async () => {
  const files = Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`${i}.txt`, strToU8('x')]))
  await expect(unpackArchive(zipSync(files))).rejects.toThrow('512')
})

it('при квоте не добавляет недолговечную картинку в память', async () => {
  const { addRawAsset, listAssets } = await import('../../src/lib/assets')
  const before = listAssets()
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota') })
  expect(() => addRawAsset('data:image/png;base64,Yg==')).toThrow('Не удалось сохранить')
  expect(listAssets()).toEqual(before)
})

it('отказывается выдавать неполный backup с отсутствующей картинкой', () => {
  expect(() => buildDocumentArchive('![x](asset:missing)', DEFAULT_SETTINGS)).toThrow('Не найдено изображение')
})

it('не переписывает адреса в тексте, inline-коде и листингах', async () => {
  const { addRawAsset } = await import('../../src/lib/assets')
  const { buildDocumentArchive: build, readDocumentArchive: read } = await import('../../src/lib/docArchive')
  const key = addRawAsset('data:image/png;base64,YQ==')
  const prose = `Адрес: ${key}; images/image-0.png\n\n\`${key}\`\n\n\`\`\`md\n![пример](${key})\n\`\`\`\n\n`
  const result = read(await unpackArchive(build(prose + `![Рисунок](${key})`, DEFAULT_SETTINGS)))!
  expect(result.md.startsWith(prose)).toBe(true)
  expect(result.md.endsWith(`![Рисунок](${Object.keys(result.assets)[0]})`)).toBe(true)
})

it('отклоняет повторяющиеся записи и отсутствующий логотип', () => {
  const entry = (settings: object, images: string[]) => ({ 'document.md': strToU8('x'), 'document.json': strToU8(JSON.stringify({ version: 1, settings, images })) })
  expect(() => readDocumentArchive(entry({}, ['images/image-0.png', 'images/image-0.png']))).toThrow('повторяющиеся')
  expect(() => readDocumentArchive(entry({ titleLogo: 'images/image-0.png' }, []))).toThrow('Логотип')
})
