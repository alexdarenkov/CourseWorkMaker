import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { DownloadIcon, MoonIcon, SparklesIcon, Spinner, SunIcon, UploadIcon } from './icons'
import { IconButton } from './ui'

interface HeaderProps {
  downloading: false | 'docx'
  onDownload: (format: 'docx') => void
  /** Загрузка .md/.zip — заменяет текущий документ (с confirm внутри). */
  onUploadMd: (file: File) => void
  /** Фактическая тема (auto уже развёрнут в light/dark). */
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onOpenUser: () => void
  userName: string | null
}

/**
 * Шапка редактора. Навигация «Создать с ИИ» (/create) и «Загрузить» живёт
 * ТОЛЬКО здесь (AI-10) — других точек входа в эти действия в редакторе нет.
 * Экспорт — только .docx.
 */
export function Header(props: HeaderProps) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
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
      className="z-20 flex h-12 flex-shrink-0 items-center gap-3 border-b border-line text-ink pl-4 pr-3.5"
      style={{ background: 'var(--header-bg)' }}
    >
      <button
        onClick={() => navigate('/')}
        title="Texturn — на главную"
        className="flex cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-ink"
      >
        <div
          className="flex items-center justify-center rounded-lg bg-ink text-paper"
          style={{ width: 26, height: 26, fontFamily: "'Times New Roman',serif", fontSize: 15, fontWeight: 700 }}
        >
          T
        </div>
        <div className="font-mono text-[13px] font-bold tracking-wide">Texturn</div>
      </button>
      <div className="h-5 w-px bg-line" />

      {/* Навигация: единственные точки входа в генерацию и загрузку */}
      <nav className="flex items-center gap-1">
        <button
          onClick={() => navigate('/create')}
          title="Создать работу с ИИ — с нуля (текущий текст будет заменён)"
          className="flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-transparent px-3 py-1 text-[12px] font-semibold text-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <span style={{ color: 'var(--warm)' }}>
            <SparklesIcon size={13} />
          </span>
          Создать с ИИ
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,.zip,text/markdown,text/plain,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) props.onUploadMd(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          title="Загрузить .md или .zip (заменит текущий документ)"
          className="flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-transparent px-3 py-1 text-[12px] font-semibold text-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <UploadIcon size={13} />
          Загрузить
        </button>
      </nav>
      <div className="flex-1" />

      <button
        onClick={() => props.onDownload('docx')}
        title="Скачать документ DOCX"
        className="flex cursor-pointer items-center gap-2 rounded-full border-none bg-accent py-1.5 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-dark"
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
