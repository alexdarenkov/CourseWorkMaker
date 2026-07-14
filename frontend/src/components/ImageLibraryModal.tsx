import { useMemo, useState } from 'react'
import { listAssets, removeAsset } from '../lib/assets'
import { CloseIcon, ImageIcon, TrashIcon } from './icons'

interface ImageLibraryModalProps {
  /** Текущий markdown — чтобы пометить используемые картинки. */
  md: string
  onInsert: (snippet: string) => void
  onClose: () => void
  onToast: (msg: string) => void
}

/**
 * Библиотека загруженных картинок (localStorage-хранилище ассетов): просмотр,
 * вставка в markdown и удаление неиспользуемых. Картинки попадают сюда при
 * вставке с устройства, из zip-архива и из генерации графиков ИИ.
 */
export function ImageLibraryModal({ md, onInsert, onClose, onToast }: ImageLibraryModalProps) {
  const [items, setItems] = useState(() => listAssets())
  const used = useMemo(() => {
    const s = new Set<string>()
    for (const m of md.matchAll(/asset:[\w-]+/g)) s.add(m[0])
    return s
  }, [md])

  const insert = (key: string) => {
    onInsert('\nРисунок: Название рисунка\n![Рисунок](' + key + ')\n')
    onClose()
  }

  const remove = (key: string) => {
    if (used.has(key) && !window.confirm('Картинка используется в документе — на её месте появится заглушка. Удалить?')) {
      return
    }
    removeAsset(key)
    setItems(listAssets())
    onToast('Картинка удалена из хранилища')
  }

  return (
    <div
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--overlay)', backdropFilter: 'blur(3px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-pop-in flex flex-col overflow-hidden bg-surface text-ink"
        style={{
          width: 640,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: '80vh',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(61,57,41,.28)',
        }}
      >
        <div className="flex items-center gap-2.5 px-[22px] pb-2 pt-[18px]">
          <span className="text-soft">
            <ImageIcon size={17} />
          </span>
          <div className="text-[16.5px] font-bold tracking-tight">Библиотека картинок</div>
          <span className="text-[12px] text-muted">{items.length} шт.</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            title="Закрыть"
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border-none bg-hover text-soft hover:bg-hover-2"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="px-[22px] pb-2 text-xs text-muted">
          Клик по картинке вставляет её в текст на позицию курсора. Сюда попадают картинки с
          устройства, из zip-архивов и графики, построенные ИИ.
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-[18px]">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-[12.5px] text-muted">
              <ImageIcon size={28} />
              Пока пусто — вставьте картинку кнопкой в панели редактора или перетащите файл
            </div>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {items.map(({ key, dataUrl }) => (
                <div
                  key={key}
                  className="group relative overflow-hidden rounded-xl border border-edge bg-paper"
                >
                  <button
                    onClick={() => insert(key)}
                    title={'Вставить в текст: ' + key}
                    className="block w-full cursor-pointer border-none bg-transparent p-0"
                  >
                    <img
                      src={dataUrl}
                      alt={key}
                      className="h-[100px] w-full bg-white object-contain"
                    />
                  </button>
                  <div className="flex items-center gap-1 px-2 py-1">
                    <span className="min-w-0 flex-1 truncate text-[10px] text-faint" title={key}>
                      {key.replace(/^asset:/, '')}
                    </span>
                    {used.has(key) && (
                      <span
                        title="Используется в документе"
                        className="rounded-full px-1.5 text-[9px] font-bold leading-[14px]"
                        style={{ background: 'rgba(93,138,82,.16)', color: '#5d8a52' }}
                      >
                        в тексте
                      </span>
                    )}
                    <button
                      onClick={() => remove(key)}
                      title="Удалить из хранилища"
                      className="flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted hover:bg-hover hover:text-ink"
                    >
                      <TrashIcon size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
