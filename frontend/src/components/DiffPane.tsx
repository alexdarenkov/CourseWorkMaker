import { useMemo } from 'react'
import { diffLines, diffStats, DiffLine } from '../lib/diff'
import { CheckIcon, CloseIcon, SparklesIcon } from './icons'

interface DiffPaneProps {
  /** Ширина колонки — та же, что была бы у редактора. */
  width: string
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

/**
 * Просмотр ИИ-правки ПРЯМО в колонке редактора (вместо textarea): зелёное
 * добавится, красное удалится; ничего не применяется до «Принять».
 * Отключается настройкой редактора «Diff-просмотр ИИ-правок».
 */
export function DiffPane({ width, oldText, newText, onApply, onReject }: DiffPaneProps) {
  const lines = useMemo(() => diffLines(oldText, newText), [oldText, newText])
  const stats = useMemo(() => diffStats(lines), [lines])
  const rows = useMemo(() => collapse(lines), [lines])

  return (
    <section
      className="relative flex min-h-0 flex-col border-r border-line bg-surface"
      style={{ width, minWidth: 340 }}
    >
      <div className="flex h-[38px] flex-shrink-0 items-center gap-2 border-b border-hover pl-3.5 pr-2">
        <span style={{ color: 'var(--warm)' }}>
          <SparklesIcon size={14} />
        </span>
        <span className="text-[12.5px] font-bold tracking-tight">ИИ-правка</span>
        <span className="text-[11.5px] font-semibold" style={{ color: '#5d8a52' }}>
          +{stats.added}
        </span>
        <span className="text-[11.5px] font-semibold" style={{ color: 'var(--danger)' }}>
          −{stats.removed}
        </span>
        <div className="flex-1" />
        <button
          onClick={onReject}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-edge bg-transparent px-3 py-1 text-[11.5px] font-semibold text-soft transition-colors hover:bg-hover"
        >
          <CloseIcon size={11} />
          Отклонить
        </button>
        <button
          onClick={onApply}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-accent px-3 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-accent-dark"
        >
          <CheckIcon size={11} />
          Принять
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto px-3 py-2"
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
              {r.text || ' '}
            </div>
          ),
        )}
      </div>
    </section>
  )
}
