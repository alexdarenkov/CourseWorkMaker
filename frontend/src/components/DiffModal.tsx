import { useMemo } from 'react'
import { diffLines, diffStats, DiffLine } from '../lib/diff'
import { CheckIcon, CloseIcon, SparklesIcon } from './icons'

interface DiffModalProps {
  oldText: string
  newText: string
  onApply: () => void
  onReject: () => void
}

/** Ряды дифа со свёрнутыми длинными неизменёнными кусками (2 строки контекста). */
type Row = DiffLine | { type: 'skip'; count: number }

function collapse(lines: DiffLine[], context = 2): Row[] {
  const rows: Row[] = []
  let sameBuf: DiffLine[] = []
  const flush = (isEnd: boolean) => {
    const keepHead = rows.length > 0 ? context : 0 // контекст после предыдущего изменения
    const keepTail = isEnd ? 0 : context // контекст перед следующим изменением
    if (sameBuf.length <= keepHead + keepTail + 3) {
      rows.push(...sameBuf)
    } else {
      rows.push(...sameBuf.slice(0, keepHead))
      rows.push({ type: 'skip', count: sameBuf.length - keepHead - keepTail })
      rows.push(...sameBuf.slice(sameBuf.length - keepTail))
    }
    sameBuf = []
  }
  for (const l of lines) {
    if (l.type === 'same') sameBuf.push(l)
    else {
      flush(false)
      rows.push(l)
    }
  }
  flush(true)
  return rows
}

const ROW_STYLE: Record<'same' | 'add' | 'del', React.CSSProperties> = {
  same: {},
  add: { background: 'rgba(93,138,82,.14)' },
  del: { background: 'rgba(200,74,58,.12)', opacity: 0.75 },
}

/** Просмотр ИИ-правки: что изменится, если принять результат. */
export function DiffModal({ oldText, newText, onApply, onReject }: DiffModalProps) {
  const lines = useMemo(() => diffLines(oldText, newText), [oldText, newText])
  const stats = useMemo(() => diffStats(lines), [lines])
  const rows = useMemo(() => collapse(lines), [lines])

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--overlay)', backdropFilter: 'blur(3px)' }}
    >
      <div
        className="animate-pop-in flex flex-col overflow-hidden bg-surface text-ink"
        style={{
          width: 760,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: '86vh',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(61,57,41,.28)',
        }}
      >
        <div className="flex items-center gap-2.5 px-[22px] pb-2 pt-[18px]">
          <span style={{ color: 'var(--warm)' }}>
            <SparklesIcon size={18} />
          </span>
          <div className="text-[16.5px] font-bold tracking-tight">Правка готова — проверьте изменения</div>
          <div className="flex-1" />
          <span className="text-[12px] font-semibold" style={{ color: '#5d8a52' }}>
            +{stats.added}
          </span>
          <span className="text-[12px] font-semibold" style={{ color: 'var(--danger)' }}>
            −{stats.removed}
          </span>
        </div>
        <div className="px-[22px] pb-2 text-xs text-muted">
          Зелёное — добавится, красное — удалится. Ничего не применится, пока вы не нажмёте
          «Принять».
        </div>
        <div
          className="mx-[22px] mb-2 flex-1 overflow-auto rounded-xl border border-edge bg-paper px-3 py-2"
          style={{ fontFamily: "'JetBrains Mono',ui-monospace,Menlo,monospace", fontSize: 12 }}
        >
          {rows.map((r, i) =>
            r.type === 'skip' ? (
              <div key={i} className="select-none py-1 text-center text-[11px] text-faint">
                ··· {r.count} строк без изменений ···
              </div>
            ) : (
              <div
                key={i}
                style={{
                  ...ROW_STYLE[r.type],
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  padding: '0 6px',
                  borderRadius: 4,
                }}
              >
                <span className="select-none pr-1.5 text-faint">
                  {r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}
                </span>
                {r.text || ' '}
              </div>
            ),
          )}
        </div>
        <div className="flex items-center gap-2.5 border-t border-hover px-[22px] py-3.5">
          <div className="text-[11.5px] text-faint">
            После принятия текст можно вернуть кнопкой «Откатить ИИ-правку» в статус-баре
          </div>
          <div className="flex-1" />
          <button
            onClick={onReject}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-edge bg-transparent px-[18px] py-2 text-[13px] font-semibold text-soft transition-colors hover:bg-hover"
          >
            <CloseIcon />
            Отклонить
          </button>
          <button
            onClick={onApply}
            className="flex cursor-pointer items-center gap-2 rounded-full border-none bg-accent px-[18px] py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-dark"
          >
            <CheckIcon />
            Принять
          </button>
        </div>
      </div>
    </div>
  )
}
