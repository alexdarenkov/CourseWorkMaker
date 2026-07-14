import { RefObject } from 'react'
import { LINE_HEIGHT } from '../lib/gostRender'
import type { Page } from '../lib/paginate'
import { CollapseRightIcon, FitIcon, GearIcon, MinusIcon, PlusIcon } from './icons'
import { IconButton } from './ui'

interface PreviewPaneProps {
  pages: Page[]
  zoom: number
  previewRef: RefObject<HTMLDivElement>
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomFit: () => void
  onOpenSettings: () => void
  onCollapse: () => void
}

const PW = 794
const PH = 1123
const GAP = 30

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
        <IconButton title="Свернуть превью" onClick={props.onCollapse} hoverBg="var(--hover-2)" size={28}>
          <CollapseRightIcon />
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
          <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: PW }}>
            {pages.length ? (
              pages.map((p, i) => (
                <div key={i} style={pageStyle} dangerouslySetInnerHTML={{ __html: p.html }} />
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
