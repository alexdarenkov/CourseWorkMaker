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
        done(canvas.toDataURL('image/png').split(',')[1] ?? null)
      } catch {
        done(null)
      }
    }
    img.onerror = () => done(null)
    img.src = url
  })
}
