import { RefObject, useCallback, useEffect, useState } from 'react'
import type { CaretRect } from '../hooks/useCaretMarker'
import { LINE_HEIGHT } from '../lib/gostRender'
import { PAGE_GAP_PX, PAGE_HEIGHT_PX, PAGE_WIDTH_PX, PREVIEW_PAD_TOP_PX } from '../lib/pageGeometry'
import type { Page } from '../lib/paginate'
import { FitIcon, GearIcon, MinusIcon, MonitorIcon, PlusIcon } from './icons'
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
  /** Последняя запись в localStorage не удалась. */
  saveFailed?: boolean
  /** Повторить запись (метка «Не сохранено» — кнопка). */
  onRetrySave?: () => void
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
  boxShadow: 'var(--shadow-paper)',
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
  const { pages, zoom, previewRef } = props
  // Номер страницы для строки состояния: лист, пересекающий верхнюю треть окна.
  const [current, setCurrent] = useState(0)
  const updateCurrent = useCallback(() => {
    const el = previewRef.current
    if (!el || !pages.length) return
    const stride = (PH + GAP) * zoom
    const at = Math.floor((el.scrollTop + el.clientHeight / 3 - PREVIEW_PAD_TOP_PX) / stride)
    setCurrent(Math.max(0, Math.min(pages.length - 1, at)))
  }, [previewRef, pages.length, zoom])
  useEffect(updateCurrent, [updateCurrent])

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      style={{ minWidth: 0, background: 'var(--preview-bg)' }}
    >
      <div className="preview-toolbar">
        {/* Число страниц — только в строке состояния снизу; здесь — лишь
            предупреждение, если запись в браузер не удалась. */}
        {props.saveFailed && (
          <button
            type="button"
            className="save-chip save-chip--warn"
            title="Не удалось записать изменения в браузер — нажмите, чтобы повторить"
            onClick={props.onRetrySave}
          >
            <MonitorIcon />
            Не сохранено · Повторить
          </button>
        )}
        <div className="flex-1" />
        {/* Масштаб — только «−» и «+», без подписи процентов. */}
        <IconButton title="Уменьшить" onClick={props.onZoomOut} size={24} className="tb-icon">
          <MinusIcon size={13} />
        </IconButton>
        <IconButton title="Увеличить" onClick={props.onZoomIn} size={24} className="tb-icon">
          <PlusIcon size={13} />
        </IconButton>
        <IconButton title="По ширине окна" onClick={props.onZoomFit} size={24} className="tb-icon">
          <FitIcon size={13} strokeWidth={1.7} />
        </IconButton>
        <span className="toolbar-sep" style={{ margin: '0 3px' }} />
        <IconButton title="Настройки документа (ГОСТ)" onClick={props.onOpenSettings} size={24} className="tb-icon">
          <GearIcon size={14} />
        </IconButton>
      </div>
      <div ref={previewRef} onScroll={updateCurrent} className="flex-1 overflow-auto px-6 pb-[60px] pt-7">
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
              // Скелетон вместо текстовой заглушки: та же геометрия листа,
              // приглушённые полосы вместо строк текста ("тёплый" серый —
              // тон стола за листом, --preview-bg, не токен темы: сам лист
              // всегда белый вне зависимости от темы приложения).
              <div style={pageStyle} aria-label="Формируем превью…">
                <div
                  className="mx-auto animate-pulse rounded-sm"
                  style={{ width: '42%', height: 15, background: '#e8e6dc' }}
                />
                <div className="mt-9 flex flex-col gap-3">
                  {[100, 96, 91, 97, 62].map((w, i) => (
                    <div
                      key={i}
                      className="animate-pulse rounded-sm"
                      style={{
                        width: `${w}%`,
                        height: 9,
                        background: '#eeece3',
                        animationDelay: `${i * 90}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="preview-status">
        <span className="ml-auto">
          стр. <b>{pages.length ? current + 1 : 0}</b> / {pages.length}
        </span>
      </div>
    </section>
  )
}
