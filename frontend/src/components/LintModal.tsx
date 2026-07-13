import { CloseIcon, ShieldCheckIcon } from './icons'

interface LintModalProps {
  issues: string[]
  onClose: () => void
}

/** Результаты нормоконтроля: список замечаний к оформлению по ГОСТ. */
export function LintModal({ issues, onClose }: LintModalProps) {
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
          width: 560,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: '76vh',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(61,57,41,.28)',
        }}
      >
        <div className="flex items-center gap-2.5 px-[22px] pb-3.5 pt-[18px]">
          <span className="text-warm">
            <ShieldCheckIcon size={18} />
          </span>
          <div className="text-[16.5px] font-bold tracking-tight">
            Нормоконтроль · {issues.length}{' '}
            {issues.length === 1 ? 'замечание' : issues.length < 5 ? 'замечания' : 'замечаний'}
          </div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            title="Закрыть"
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border-none bg-hover text-soft hover:bg-hover-2"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-[22px] pb-4">
          {issues.map((issue, i) => (
            <div
              key={i}
              className="mt-2 flex items-start gap-2.5 rounded-xl border border-edge bg-paper px-3.5 py-2.5 text-[13px] leading-relaxed"
            >
              <span
                className="mt-[6px] h-[7px] w-[7px] flex-shrink-0 rounded-full"
                style={{ background: '#d9a23f' }}
              />
              <span>{issue}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-hover px-[22px] py-3 text-[11.5px] text-faint">
          Проверяются требования оформления ГОСТ 7.32-2017: обязательные разделы, подписи
          таблиц и рисунков, ссылки на источники, заголовки
        </div>
      </div>
    </div>
  )
}
