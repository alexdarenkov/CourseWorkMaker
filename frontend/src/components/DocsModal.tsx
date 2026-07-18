import { useCallback, useEffect, useState } from 'react'
import { documentsApi, DocumentDto, DocumentMeta } from '../api'
import { PlusIcon, TrashIcon } from './icons'
import { ModalCloseButton, ModalShell } from './ui'

interface DocsModalProps {
  /** id открытого сейчас документа (подсвечивается в списке). */
  currentId: string | null
  onOpen: (doc: DocumentDto) => void
  onCreate: () => void
  /** Документ удалён на сервере (страница решает, что делать с текущим). */
  onDeleted: (id: string) => void
  onClose: () => void
  onToast: (msg: string) => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function DocsModal(props: DocsModalProps) {
  const [docs, setDocs] = useState<DocumentMeta[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setDocs(await documentsApi.list())
    } catch {
      props.onToast('Не удалось загрузить список документов')
      props.onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const open = async (meta: DocumentMeta) => {
    if (meta.id === props.currentId) {
      props.onClose()
      return
    }
    setBusyId(meta.id)
    try {
      const doc = await documentsApi.get(meta.id)
      props.onOpen(doc)
      props.onClose()
    } catch {
      props.onToast('Не удалось открыть документ')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (meta: DocumentMeta, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Удалить «${meta.name}» безвозвратно?`)) return
    setBusyId(meta.id)
    try {
      await documentsApi.remove(meta.id)
      props.onDeleted(meta.id)
      await refresh()
    } catch {
      props.onToast('Не удалось удалить документ')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ModalShell onClose={props.onClose} width={520} maxHeight="76vh">
        <div className="flex items-center px-[22px] pb-3.5 pt-[18px]">
          <div className="text-[16.5px] font-bold tracking-tight">Мои документы</div>
          <div className="flex-1" />
          <ModalCloseButton onClose={props.onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-[14px] pb-2">
          {docs === null && (
            <div className="px-2 py-6 text-center text-[13px] text-faint">Загрузка…</div>
          )}
          {docs?.length === 0 && (
            <div className="px-2 py-6 text-center text-[13px] text-faint">
              Документов пока нет — создайте первый
            </div>
          )}
          {docs?.map((d) => (
            <div
              key={d.id}
              onClick={() => open(d)}
              className="group flex cursor-pointer items-center gap-3 rounded-xl px-[10px] py-[9px] hover:bg-hover"
              style={{ opacity: busyId === d.id ? 0.6 : 1 }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">
                  {d.name}
                  {d.id === props.currentId && (
                    <span className="ml-2 rounded-full bg-warm-bg px-2 py-px text-[10.5px] font-semibold text-warm">
                      открыт
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-faint">{formatDate(d.updatedAt)}</div>
              </div>
              <button
                onClick={(e) => remove(d, e)}
                title="Удалить документ"
                className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-faint opacity-0 hover:bg-hover-2 hover:text-ink group-hover:opacity-100"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-hover px-[16px] py-3">
          <button
            onClick={() => {
              props.onCreate()
              props.onClose()
            }}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-warm-border bg-transparent px-4 py-[7px] text-[13px] font-semibold text-warm transition-colors hover:bg-warm-bg"
          >
            <PlusIcon />
            <span>Новая работа</span>
          </button>
        </div>
    </ModalShell>
  )
}
