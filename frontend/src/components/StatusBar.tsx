import { ShieldCheckIcon, UndoIcon } from './icons'

interface StatusBarProps {
  saved: boolean
  wordCount: number
  pageCount: number
  /** Целевой объём (стр.) — 0 скрывает прогресс. */
  pageTarget: number
  lintBusy: boolean
  /** Результат последней проверки (число замечаний) или null, если не запускалась. */
  lintCount: number | null
  onLint: () => void
  /** Есть снапшот текста до ИИ — можно откатить/вернуть. */
  canRollback: boolean
  onRollback: () => void
}

export function StatusBar(props: StatusBarProps) {
  const { saved, wordCount, pageCount, pageTarget } = props
  const reached = pageTarget > 0 && pageCount >= pageTarget
  return (
    <footer className="flex h-[30px] flex-shrink-0 items-center gap-4 border-t border-line bg-paper px-5 text-[11.5px] text-muted">
      <div className="flex items-center gap-1.5">
        <span
          className="h-[7px] w-[7px] rounded-full transition-colors duration-200"
          style={{ background: saved ? '#5d8a52' : '#d9a23f' }}
        />
        <span>{saved ? 'Сохранено' : 'Изменения…'}</span>
      </div>
      {props.canRollback && (
        <button
          onClick={props.onRollback}
          title="Заменяет текст версией до применения ИИ; повторное нажатие возвращает ИИ-версию"
          className="flex cursor-pointer items-center gap-[5px] border-none bg-transparent p-0 font-semibold text-muted hover:text-ink"
        >
          <UndoIcon />
          <span>Откатить ИИ-правку</span>
        </button>
      )}
      <button
        onClick={props.onLint}
        disabled={props.lintBusy}
        title="Проверить оформление по ГОСТ: подписи, ссылки на источники, заголовки, габариты таблиц и схем"
        className="flex cursor-pointer items-center gap-[5px] border-none bg-transparent p-0 font-semibold text-muted hover:text-ink disabled:opacity-60"
      >
        <ShieldCheckIcon />
        <span>{props.lintBusy ? 'Проверяем…' : 'Нормоконтроль'}</span>
        {!props.lintBusy && props.lintCount !== null && (
          <span
            className="rounded-full px-1.5 text-[10.5px] font-bold leading-[16px]"
            style={{
              background: props.lintCount > 0 ? 'rgba(217,162,63,.18)' : 'rgba(93,138,82,.16)',
              color: props.lintCount > 0 ? '#a9761c' : '#5d8a52',
            }}
          >
            {props.lintCount > 0 ? props.lintCount : '✓'}
          </span>
        )}
      </button>
      <div className="flex-1" />
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{wordCount} слов</span>
      <span
        style={{ fontVariantNumeric: 'tabular-nums', color: reached ? '#5d8a52' : undefined }}
        title={pageTarget > 0 ? `Целевой объём задаётся в настройках документа` : undefined}
      >
        {pageTarget > 0 ? `${pageCount} из ~${pageTarget} стр.` : `${pageCount} стр.`}
      </span>
    </footer>
  )
}
