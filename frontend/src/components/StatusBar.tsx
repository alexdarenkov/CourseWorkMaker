import { CheckIcon } from './icons'

interface StatusBarProps {
  saved: boolean
  wordCount: number
  pageCount: number
}

export function StatusBar({ saved, wordCount, pageCount }: StatusBarProps) {
  return (
    <footer className="flex h-[30px] flex-shrink-0 items-center gap-4 border-t border-line bg-paper px-5 text-[11.5px] text-muted">
      <div className="flex items-center gap-1.5">
        <span
          className="h-[7px] w-[7px] rounded-full transition-colors duration-200"
          style={{ background: saved ? '#5d8a52' : '#d9a23f' }}
        />
        <span>{saved ? 'Сохранено' : 'Изменения…'}</span>
      </div>
      <div className="flex-1" />
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{wordCount} слов</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pageCount} стр.</span>
      <div className="flex items-center gap-[5px] font-semibold" style={{ color: '#5d8a52' }}>
        <CheckIcon />
        <span>ГОСТ 7.32—2017</span>
      </div>
    </footer>
  )
}
