import { RefObject } from 'react'
import type { CaretRect } from '../hooks/useCaretMarker'
import { LINE_HEIGHT } from '../lib/gostRender'
import { PAGE_GAP_PX, PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from '../lib/pageGeometry'
import type { Page } from '../lib/paginate'
import { FitIcon, GearIcon, MinusIcon, PlusIcon } from './icons'
import { IconButton } from './ui'

interface PreviewPaneProps {
  pages: Page[]
  zoom: number
  previewRef: RefObject<HTMLDivElement>
  /** Лента страниц: по ней меряются координаты каретки. */
  stripRef: RefObject<HTMLDivElement>
  /** Каретка редактора в координатах ленты (px без зума); null — не определена. */
  caret: CaretRect | null
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomFit: () => void
  onOpenSettings: () => void
}

// Геометрия ленты — из общего модуля: по этим же числам синхронная прокрутка
// (useScrollSync) вычисляет, куда встать превью.
const PW = PAGE_WIDTH_PX
const PH = PAGE_HEIGHT_PX
const GAP = PAGE_GAP_PX

const pageStyle: React.CSSProperties = {
  width: '210mm',
  height: '297mm',
  marginBottom: GAP,
  background: '#fff',
  position: 'relative',
  overflow: 'hidden',
  boxShadow: '0 2px 8px rgba(61,57,41,.10), 0 14px 36px rgba(61,57,41,.08)',
  borderRadius: 3,
  padding: '20mm 15mm 20mm 30mm',
  fontFamily: "'Times New Roman',Times,serif",
  fontSize: '14pt',
  // Калиброванная высота строки Word (полуторный интервал Times New Roman);
  // обязана совпадать с HOST_CSS пагинатора — см. LINE_HEIGHT в gostRender.ts.
  lineHeight: Number(LINE_HEIGHT),
  color: '#000',
}

export function PreviewPane(props: PreviewPaneProps) {
  const { pages, zoom } = props
  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      style={{ minWidth: 360, background: 'var(--preview-bg)' }}
    >
      <div
        className="flex h-[38px] flex-shrink-0 items-center gap-1.5 overflow-hidden border-b pl-3.5 pr-2.5"
        style={{ borderColor: 'var(--line)', background: 'var(--preview-bar)', flexWrap: 'nowrap' }}
      >
        <div className="min-w-1 flex-1" />
        <IconButton title="Уменьшить" onClick={props.onZoomOut} hoverBg="var(--hover-2)" size={28}>
          <MinusIcon />
        </IconButton>
        <span
          className="text-center text-xs text-soft"
          style={{ width: 44, fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <IconButton title="Увеличить" onClick={props.onZoomIn} hoverBg="var(--hover-2)" size={28}>
          <PlusIcon />
        </IconButton>
        <IconButton title="По ширине окна" onClick={props.onZoomFit} hoverBg="var(--hover-2)" size={28}>
          <FitIcon />
        </IconButton>
        <div className="mx-1 h-4 w-px bg-line" />
        <IconButton title="Настройки документа (ГОСТ)" onClick={props.onOpenSettings} hoverBg="var(--hover-2)" size={28}>
          <GearIcon size={16} />
        </IconButton>
      </div>
      <div ref={props.previewRef} className="flex-1 overflow-auto px-6 pb-[60px] pt-7">
        <div
          style={{
            width: PW * zoom,
            margin: '0 auto',
            height: (pages.length || 1) * (PH + GAP) * zoom,
            position: 'relative',
          }}
        >
          <div
            ref={props.stripRef}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              width: PW,
              position: 'relative',
            }}
          >
            {/* Каретка редактора — на своём месте в тексте (координаты меряются
                по отрендеренному Range, см. useCaretMarker). */}
            {props.caret && (
              <div
                aria-hidden="true"
                className="pv-caret"
                style={{
                  position: 'absolute',
                  left: props.caret.x,
                  top: props.caret.y,
                  height: props.caret.h,
                  // Листы тоже position:relative и идут в DOM ниже — без
                  // z-index они бы перекрыли каретку.
                  zIndex: 2,
                }}
              />
            )}
            {pages.length ? (
              pages.map((p, i) => (
                <div
                  key={i}
                  data-page={i}
                  style={pageStyle}
                  dangerouslySetInnerHTML={{ __html: p.html }}
                />
              ))
            ) : (
              <div style={pageStyle}>
                <div
                  style={{ color: '#999', fontStyle: 'italic', textAlign: 'center', paddingTop: '40mm' }}
                >
                  Формируем превью…
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
