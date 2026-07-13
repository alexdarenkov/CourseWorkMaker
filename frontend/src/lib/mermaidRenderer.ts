import mermaid from 'mermaid'

let initialized = false
let counter = 0
const cache = new Map<string, string | null>()

function ensureInit() {
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      fontFamily: 'Times New Roman',
      securityLevel: 'loose',
      // Подписи обычным SVG-текстом, без foreignObject: HTML-подписи не
      // растеризуются в canvas (PNG для DOCX вышел бы без текста).
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
    })
    initialized = true
  }
}

const ERROR_HTML =
  '<div style="border:1px dashed #b00;padding:4mm;font-size:11pt;color:#b00">Ошибка в синтаксисе схемы mermaid</div>'

/** SVG из кэша; null — рендер ещё идёт (запускает его и потом вызовет onReady). */
export function getMermaidSvg(code: string, onReady: () => void): string | null {
  if (cache.has(code)) return cache.get(code) ?? null
  cache.set(code, null)
  ensureInit()
  const id = 'mm' + counter++
  mermaid
    .render(id, code)
    .then((r) => {
      cache.set(code, r.svg)
      onReady()
    })
    .catch(() => {
      cache.set(code, ERROR_HTML)
      document.getElementById('d' + id)?.remove()
      onReady()
    })
  return null
}

/** Размеры схемы из viewBox корневого svg (надёжнее naturalWidth для SVG). */
function svgSize(svg: string): { w: number; h: number } {
  const m = /viewBox="([^"]+)"/.exec(svg)
  if (m) {
    const p = m[1].trim().split(/[\s,]+/).map(Number)
    if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: p[2], h: p[3] }
  }
  return { w: 800, h: 450 }
}

const MAX_CANVAS_PIXELS = 12_000_000
const PNG_TIMEOUT_MS = 15_000

// CRC32 для PNG-чанков (полином zlib).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Вписывает в PNG chunk pHYs с плотностью dpi. Превью меряет mermaid-схему по
 * viewBox в px при 96 dpi, а PNG для DOCX растрируется с масштабом k — без
 * явной плотности (96·k dpi) конвертер считал бы картинку в k раз крупнее и
 * раскладка страниц DOCX расходилась бы с превью. canvas.toDataURL плотность
 * не пишет, поэтому чанк вставляется вручную сразу после IHDR.
 */
export function pngWithDpi(base64: string, dpi: number): string {
  const bin = atob(base64)
  const src = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i)
  // Сигнатура PNG (8) + IHDR: длина (4) + тип (4) + данные (13) + CRC (4).
  const IHDR_END = 33
  if (src.length < IHDR_END || src[0] !== 0x89 || src[1] !== 0x50) return base64
  const ppm = Math.round(dpi / 0.0254) // пикселей на метр
  const chunk = new Uint8Array(4 + 4 + 9 + 4)
  const dv = new DataView(chunk.buffer)
  dv.setUint32(0, 9) // длина данных
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // 'pHYs'
  dv.setUint32(8, ppm)
  dv.setUint32(12, ppm)
  chunk[16] = 1 // единица — метр
  dv.setUint32(17, crc32(chunk.subarray(4, 17)))
  const out = new Uint8Array(src.length + chunk.length)
  out.set(src.subarray(0, IHDR_END))
  out.set(chunk, IHDR_END)
  out.set(src.subarray(IHDR_END), IHDR_END + chunk.length)
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < out.length; i += CHUNK) {
    s += String.fromCharCode(...out.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

/**
 * Растеризация mermaid-схемы в PNG (base64 без префикса) для экспорта в DOCX.
 * Никогда не зависает: любой сбой или таймаут → null (в DOCX будет заглушка).
 */
export async function mermaidToPng(code: string, scale = 2.5): Promise<string | null> {
  ensureInit()
  let svg: string
  try {
    const r = await mermaid.render('mmexp' + counter++, code)
    svg = r.svg
  } catch {
    return null
  }
  const { w, h } = svgSize(svg)
  // Сверхбольшая схема: уменьшаем масштаб, чтобы не упереться в лимиты canvas.
  const k = Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / (w * h)))
  // Явные размеры на корневом svg — иначе naturalWidth/Height могут быть нулевыми.
  const sized = svg.replace(/<svg([^>]*)>/, (_full, attrs: string) => {
    const a = attrs.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '')
    return `<svg width="${w}" height="${h}"${a}>`
  })

  return new Promise((resolve) => {
    let settled = false
    const done = (value: string | null) => {
      if (!settled) {
        settled = true
        window.clearTimeout(timer)
        URL.revokeObjectURL(url)
        resolve(value)
      }
    }
    const timer = window.setTimeout(() => done(null), PNG_TIMEOUT_MS)
    const blob = new Blob([sized], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w * k))
        canvas.height = Math.max(1, Math.round(h * k))
        const cx = canvas.getContext('2d')
        if (!cx) {
          done(null)
          return
        }
        cx.fillStyle = '#ffffff'
        cx.fillRect(0, 0, canvas.width, canvas.height)
        cx.drawImage(img, 0, 0, canvas.width, canvas.height)
        // toDataURL может бросить SecurityError (например, foreignObject в SVG).
        const b64 = canvas.toDataURL('image/png').split(',')[1] ?? null
        // Плотность 96·k dpi: конвертер получит те же мм, что показывает превью.
        done(b64 ? pngWithDpi(b64, Math.round(96 * k)) : null)
      } catch {
        done(null)
      }
    }
    img.onerror = () => done(null)
    img.src = url
  })
}
