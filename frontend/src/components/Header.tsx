import type { AiJob } from '../api'
import type { Settings } from '../lib/settings'
import { DownloadIcon, MoonIcon, SparklesIcon, Spinner, SunIcon } from './icons'
import { IconButton } from './ui'

interface HeaderProps {
  docName: string
  onDocName: (v: string) => void
  downloading: boolean
  onDownload: () => void
  onOpenAi: () => void
  aiJob: AiJob | null
  theme: Settings['theme']
  onToggleTheme: () => void
  onOpenUser: () => void
  userName: string | null
}

export function Header(props: HeaderProps) {
  const initials = props.userName
    ? props.userName
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : null

  return (
    <header
      className="z-20 flex h-14 flex-shrink-0 items-center gap-3.5 border-b border-line text-ink pl-5 pr-4"
      style={{ background: 'var(--header-bg)' }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center rounded-lg bg-ink text-paper"
          style={{ width: 27, height: 27, fontFamily: "'Times New Roman',serif", fontSize: 16, fontWeight: 700 }}
        >
          §
        </div>
        <div className="flex flex-col gap-px">
          <div className="font-mono text-[13px] font-bold tracking-wide">md2docx</div>
          <div className="text-[9.5px] font-semibold uppercase tracking-[.08em] text-muted">
            ГОСТ 7.32—2017
          </div>
        </div>
      </div>
      <div className="h-6 w-px bg-line" />
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          value={props.docName}
          onChange={(e) => props.onDocName(e.target.value)}
          title="Название документа"
          className="w-60 truncate rounded-[7px] border-none bg-transparent px-2 py-[5px] text-[13.5px] font-medium text-ink hover:bg-hover focus:bg-hover"
        />
        <span className="flex-shrink-0 text-xs text-faint">.md</span>
      </div>
      <div className="flex-1" />
      <button
        onClick={props.onOpenAi}
        title={
          props.aiJob
            ? `${props.aiJob.stage} — нажмите, чтобы открыть окно (там можно остановить)`
            : 'Сгенерировать курсовую с помощью ИИ'
        }
        className="relative flex cursor-pointer items-center gap-2 overflow-hidden rounded-full border border-warm-border bg-transparent px-4 py-2 text-[13px] font-semibold text-warm transition-colors hover:bg-warm-bg"
      >
        {props.aiJob && (
          <span
            className="absolute inset-y-0 left-0 bg-warm-bg transition-all duration-500"
            style={{ width: `${Math.max(4, props.aiJob.progress * 100)}%` }}
          />
        )}
        <span className="relative flex items-center gap-2">
          {props.aiJob ? <Spinner /> : <SparklesIcon />}
          <span>
            {props.aiJob
              ? `ИИ работает… ${Math.round(props.aiJob.progress * 100)}%`
              : 'Сгенерировать с ИИ'}
          </span>
        </span>
      </button>
      <button
        onClick={props.onDownload}
        title="Скачать документ DOCX"
        className="flex cursor-pointer items-center gap-2 rounded-full border-none bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-dark"
      >
        {props.downloading ? <Spinner /> : <DownloadIcon />}
        <span>{props.downloading ? 'Готовим файл…' : 'Скачать .docx'}</span>
      </button>
      <IconButton
        title={props.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        onClick={props.onToggleTheme}
        size={34}
      >
        {props.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </IconButton>
      <button
        onClick={props.onOpenUser}
        title={initials ? 'Профиль' : 'Войти'}
        className="flex cursor-pointer items-center justify-center rounded-full border-none text-[11px] font-bold tracking-wide"
        style={{
          width: 30,
          height: 30,
          background: 'var(--avatar)',
          color: 'var(--warm)',
        }}
      >
        {initials ?? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )}
      </button>
    </header>
  )
}
