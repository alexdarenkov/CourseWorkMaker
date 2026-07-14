/**
 * Хранилище локальных изображений. В markdown вставляется короткая ссылка
 * `asset:img-…`, а data-URL живёт здесь (память + localStorage), чтобы не
 * раздувать текст документа мегабайтами base64.
 */

const KEY = 'md2docx:assets:v1'
const MAX_DIMENSION = 1800

let assets: Record<string, string> = load()

function load(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (raw && typeof raw === 'object') return raw
  } catch {
    /* повреждённое хранилище игнорируем */
  }
  return {}
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(assets))
  } catch {
    /* квота/приватный режим — картинка останется только до перезагрузки */
  }
}

export function getAsset(src: string): string | null {
  return assets[src] ?? null
}

/** Все сохранённые картинки (для библиотеки изображений в редакторе). */
export function listAssets(): { key: string; dataUrl: string }[] {
  return Object.entries(assets).map(([key, dataUrl]) => ({ key, dataUrl }))
}

/** Удаляет картинку из хранилища (ссылки в markdown станут заглушками). */
export function removeAsset(key: string): void {
  if (!(key in assets)) return
  delete assets[key]
  persist()
}

/** Импорт ассетов, сгенерированных ИИ (графики matplotlib), в хранилище. */
export function importAssets(incoming: Record<string, string> | undefined): void {
  if (!incoming) return
  let changed = false
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === 'string' && value) {
      assets[key] = value
      changed = true
    }
  }
  if (changed) persist()
}

/**
 * Кэш натуральных размеров изображений: пагинация превью должна знать высоту
 * картинки ДО её загрузки, иначе текст налезает на номер страницы.
 * null — размер ещё измеряется (после измерения вызовется onReady);
 * {w:0,h:0} — изображение битое/недоступное.
 */
const sizeCache = new Map<string, { w: number; h: number } | null>()

export function getImageSize(
  src: string,
  onReady: () => void,
): { w: number; h: number } | null {
  if (sizeCache.has(src)) return sizeCache.get(src) ?? null
  sizeCache.set(src, null)
  const img = new Image()
  img.onload = () => {
    sizeCache.set(src, { w: img.naturalWidth, h: img.naturalHeight })
    onReady()
  }
  img.onerror = () => {
    sizeCache.set(src, { w: 0, h: 0 })
    onReady()
  }
  img.src = src
  return null
}

/** Ассеты, на которые ссылается markdown, — для передачи конвертеру. */
export function referencedAssets(md: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(assets)) {
    if (md.includes(key)) out[key] = assets[key]
  }
  return out
}

/** Удаляет из хранилища ассеты, на которые документ больше не ссылается.
 *  keep — ключи, живущие вне markdown (например, логотип титульного листа). */
export function pruneAssets(md: string, keep: string[] = []): void {
  let changed = false
  for (const key of Object.keys(assets)) {
    if (!md.includes(key) && !keep.includes(key)) {
      delete assets[key]
      changed = true
    }
  }
  if (changed) persist()
}

/** Кладёт готовый data-URL в хранилище (например, отрендеренный сервером
 *  титульник) и возвращает ключ ассета. */
export function addRawAsset(dataUrl: string, prefix = 'img'): string {
  const key = `asset:${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  assets[key] = dataUrl
  persist()
  return key
}

/** Сохраняет картинку с устройства (с уменьшением до разумного размера). */
export async function addImageAsset(file: File): Promise<string> {
  const dataUrl = await downscale(file)
  return addRawAsset(dataUrl)
}

async function downscale(file: File): Promise<string> {
  const original = await readAsDataUrl(file)
  const img = await loadImage(original)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
  // Маленькие PNG/JPEG не трогаем — перекодирование только ухудшит качество.
  if (scale === 1 && file.size < 600 * 1024) return original

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const cx = canvas.getContext('2d')
  if (!cx) return original
  cx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const isPng = file.type === 'image/png'
  return isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.87)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Не удалось прочитать файл'))
    r.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Файл не является изображением'))
    img.src = src
  })
}
