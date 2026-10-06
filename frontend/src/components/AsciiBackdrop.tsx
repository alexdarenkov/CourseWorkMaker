import { useEffect, useRef } from 'react'

/**
 * Декоративный ASCII-узор из макета Texturn v2 (canvas). Узор обходит блоки
 * с атрибутом data-ascii-clear: вокруг них остаётся чистое поле с мягким
 * краем. Перерисовка — только при изменении размеров и смене темы, без
 * постоянного цикла анимации. Скрыт от скринридеров и не ловит клики.
 */
interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const CHARS = '01/\\|<>[]{}=+*#%$&~^:;.,?!'
const CELL_W = 8
const CELL_H = 12
/** Пикселей на единицу узора: узор привязан к пикселям, а не к размеру блока. */
const SCALE = 240
const MAX_ALPHA = 0.5
/** Высота липкой шапки: строки под ней не рисуются. */
const HEADER_PX = 48

/** Во сколько раз CSS zoom страницы увеличивает canvas на экране. */
function zoomOf(canvas: HTMLCanvasElement): number {
  const k = canvas.getBoundingClientRect().width / canvas.clientWidth
  return Number.isFinite(k) && k > 0 ? k : 1
}

function clearBoxes(canvas: HTMLCanvasElement, k: number): Box[] {
  const page = canvas.closest('.texturn-page') || document
  const cr = canvas.getBoundingClientRect()
  // getBoundingClientRect — в экранных пикселях, рисуем — в пикселях canvas.
  return Array.from(page.querySelectorAll('[data-ascii-clear]'))
    .map((el) => {
      const r = el.getBoundingClientRect()
      return {
        x0: Math.round((r.left - cr.left) / k),
        y0: Math.round((r.top - cr.top) / k),
        x1: Math.round((r.right - cr.left) / k),
        y1: Math.round((r.bottom - cr.top) / k),
      }
    })
    .filter((b) => b.x1 > b.x0 && b.y1 > b.y0)
}

/** Непрозрачность символа в клетке (0 — пусто). */
function cellWeight(x: number, y: number, w: number, h: number, boxes: Box[]): number {
  const gx = (x * CELL_W - w / 2) / SCALE
  const gy = (y * CELL_H - h / 2) / SCALE
  const ax = gx + 0.7
  const ay = gy - 0.45
  const n =
    Math.sin(ax * 2.1 + Math.sin(ay * 1.7) * 1.6) +
    Math.sin(ay * 2.6 + Math.sin(ax * 1.3) * 1.9) +
    Math.sin((ax + ay) * 1.45 + 0.8) * 0.9 +
    Math.sin((ax - ay) * 1.15 - 0.4) * 0.9
  const dd = Math.max(0, Math.min(1, (n / 3.8 + 1) / 2))
  if (dd < 0.42) return 0
  const d = Math.min(1, (dd - 0.42) / 0.3)

  const fade = 64
  const pad = 14
  const px = x * CELL_W
  const py = y * CELL_H
  const zones = boxes.length ? boxes : [{ x0: w / 2 - 340, y0: 80, x1: w / 2 + 340, y1: h - 80 }]
  let out = Infinity
  for (const z of zones) {
    const ox = Math.max(z.x0 - pad - px, px - (z.x1 + pad))
    const oy = Math.max(z.y0 - pad - py, py - (z.y1 + pad))
    out = Math.min(out, Math.max(ox, oy))
  }
  // Узкий зазор МЕЖДУ двумя чистыми блоками тоже остаётся пустым.
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i]
      const b = zones[j]
      const gx0 = Math.min(a.x1, b.x1)
      const gx1 = Math.max(a.x0, b.x0)
      const gy0 = Math.min(a.y0, b.y0)
      const gy1 = Math.max(a.y1, b.y1)
      if (gx1 - gx0 > 260) continue
      if (px > gx0 - pad && px < gx1 + pad && py > gy0 && py < gy1) out = -1
    }
  }
  if (out < 0) return 0
  return d * Math.min(1, out / fade)
}

function paint(canvas: HTMLCanvasElement): void {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  const ctx = w && h ? canvas.getContext('2d') : null
  if (!ctx) return
  const k = zoomOf(canvas)
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * k
  const cs = getComputedStyle(document.documentElement)
  const ink = cs.getPropertyValue('--ink').trim() || '#3c3c36'
  const accent = cs.getPropertyValue('--accent').trim() || '#117dff'
  const boxes = clearBoxes(canvas, k)

  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.font = '11px "JetBrains Mono", ui-monospace, monospace'
  ctx.textBaseline = 'top'
  const startRow = Math.ceil(HEADER_PX / CELL_H)
  const cols = Math.ceil(w / CELL_W)
  const rows = Math.ceil(h / CELL_H)
  for (let y = startRow; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = cellWeight(x, y, w, h, boxes)
      if (t < 0.04) continue
      const hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
      const r = hash - Math.floor(hash)
      if (r < 0.14) continue
      ctx.globalAlpha = 0.08 + t * MAX_ALPHA
      ctx.fillStyle = t > 0.9 ? accent : ink
      ctx.fillText(CHARS[Math.floor(r * CHARS.length)], x * CELL_W, y * CELL_H)
    }
  }
  ctx.globalAlpha = 1
}

export function AsciiBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let frame = 0
    let alive = true
    const schedule = () => {
      if (frame || !alive) return
      frame = requestAnimationFrame(() => {
        frame = 0
        paint(canvas)
      })
    }
    schedule()
    const page = canvas.closest('.texturn-page')
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    resize?.observe(canvas)
    page?.querySelectorAll('[data-ascii-clear]').forEach((el) => resize?.observe(el))
    // Смена темы — класс .dark на <html>.
    const theme = new MutationObserver(schedule)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    window.addEventListener('resize', schedule)
    void document.fonts?.ready.then(schedule)
    return () => {
      alive = false
      if (frame) cancelAnimationFrame(frame)
      resize?.disconnect()
      theme.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return (
    <div className="ascii-backdrop" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  )
}
