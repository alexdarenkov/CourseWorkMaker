/** Версионированный ZIP: document.md, document.json и локальные изображения. */
import { strFromU8, strToU8, unzip, zipSync } from 'fflate'
import type { Settings } from './settings'
import { validateSettings } from './settingsValidation'
import { rewriteImageReferences } from './imageReferences'
import { getAsset } from './assets'
import { parseMD } from './markdown'

export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
const MAX_ENTRIES = 512
const MAX_MD_CHARS = 2_000_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_IMAGES = 256

type ArchiveEntries = Record<string, Uint8Array>

interface RestoredDocument {
  md: string
  settings: Settings
  assets: Record<string, string>
}

function archiveSize(entries: ArchiveEntries): number {
  return Object.values(entries).reduce((total, bytes) => total + bytes.length, 0)
}

function imageDataUrl(path: string, bytes: Uint8Array): string {
  const extension = path.split('.').pop()!
  const format = extension === 'jpg' ? 'jpeg' : extension
  let binary = ''
  // Не передаём мегабайты аргументами одной функции — переполнился бы стек.
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return `data:image/${format};base64,${btoa(binary)}`
}

export function unpackArchive(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) return Promise.reject(new Error('Архив больше 32 МБ'))
  return new Promise((resolve, reject) => {
    let size = 0
    let count = 0
    let tooLarge = false
    unzip(bytes, {
      filter: (entry) => {
        size += entry.originalSize
        count++
        if (size > MAX_ARCHIVE_BYTES || count > MAX_ENTRIES) tooLarge = true
        return !tooLarge
      },
    }, (error, entries) => {
      if (tooLarge) reject(new Error('В распакованном архиве больше 32 МБ или 512 файлов'))
      else if (error) reject(new Error('Не удалось распаковать архив'))
      else if (archiveSize(entries) > MAX_ARCHIVE_BYTES) reject(new Error('Распакованный архив слишком большой'))
      else resolve(entries)
    })
  })
}

export function buildDocumentArchive(md: string, settings: Settings): Uint8Array {
  if (md.length > MAX_MD_CHARS) throw new Error('Документ слишком большой')
  const assets: Record<string, string> = {}
  const keys = parseMD(md).flatMap((b) => b.type === 'figure' && b.src.startsWith('asset:') ? [b.src] : [])
  if (settings.titleLogo.startsWith('asset:')) keys.push(settings.titleLogo)
  for (const key of keys) {
    const value = getAsset(key)
    if (!value) throw new Error(`Не найдено изображение ${key}. Восстановите его перед экспортом.`)
    assets[key] = value
  }
  const entries: Record<string, Uint8Array> = {}
  const paths = new Map<string, string>()
  let total = 0
  for (const [key, value] of Object.entries(assets)) {
    const match = /^data:image\/(png|jpeg|gif|webp);base64,([\s\S]+)$/.exec(value)
    if (!match) throw new Error('Неподдерживаемый формат локального изображения')
    const path = `images/image-${paths.size}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`
    const data = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))
    if (data.length > MAX_IMAGE_BYTES) throw new Error('Изображение больше 10 МБ')
    total += data.length
    if (total > MAX_ARCHIVE_BYTES) throw new Error('Изображения больше 32 МБ')
    entries[path] = data
    paths.set(key, path)
  }
  entries['document.md'] = strToU8(rewriteImageReferences(md, paths).out)
  const manifest = {
    version: 1,
    settings: { ...settings, titleLogo: paths.get(settings.titleLogo) ?? settings.titleLogo },
    images: [...paths.values()],
  }
  entries['document.json'] = strToU8(JSON.stringify(manifest))
  if (archiveSize(entries) > MAX_ARCHIVE_BYTES || Object.keys(assets).length > MAX_IMAGES || Object.keys(entries).length > MAX_ENTRIES) throw new Error('Документ слишком большой для ZIP')
  const zipped = zipSync(entries)
  if (zipped.byteLength > MAX_ARCHIVE_BYTES) throw new Error('Архив больше 32 МБ')
  return zipped
}

export function readDocumentArchive(entries: ArchiveEntries): RestoredDocument | null {
  if (!entries['document.json']) return null
  const manifest = JSON.parse(strFromU8(entries['document.json']))
  if (manifest?.version !== 1 || !Array.isArray(manifest.images) || !entries['document.md']) throw new Error('Неподдерживаемый формат архива документа')
  if (manifest.images.length > MAX_IMAGES || new Set(manifest.images).size !== manifest.images.length) throw new Error('Слишком много или повторяющиеся изображения в архиве')
  const settings = validateSettings(manifest.settings)
  let md = strFromU8(entries['document.md'])
  if (md.length > MAX_MD_CHARS) throw new Error('Документ слишком большой')
  const assets: Record<string, string> = {}
  const refs = new Map<string, string>()
  for (const path of manifest.images) {
    if (typeof path !== 'string' || !/^images\/image-\d+\.(png|jpg|gif|webp)$/.test(path) || !entries[path]) throw new Error('В архиве отсутствует изображение')
    const bytes = entries[path]
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Недопустимый размер изображения')
    const key = `asset:img-${Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('')}`
    assets[key] = imageDataUrl(path, bytes)
    refs.set(path, key)
  }
  for (const block of parseMD(md)) {
    if (block.type === 'figure' && block.src.startsWith('images/') && !refs.has(block.src)) throw new Error('Изображение не перечислено в архиве')
  }
  if (settings.titleLogo.startsWith('images/') && !refs.has(settings.titleLogo)) throw new Error('Логотип не перечислен в архиве')
  md = rewriteImageReferences(md, refs).out
  settings.titleLogo = refs.get(settings.titleLogo) ?? settings.titleLogo
  return { md, settings, assets }
}
