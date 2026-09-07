import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { avatarGradient, initialsOf } from '../lib/avatar'
import { loadPersisted, savePersisted } from '../lib/storage'
import { applyTheme, effectiveTheme } from '../lib/theme'
import { DownloadIcon, MoonIcon, SparklesIcon, Spinner, SquarePenIcon, SunIcon, UserIcon } from './icons'

interface AppHeaderProps {
  /** Активный пункт навигации (подсвечивается фоном). */
  active?: 'editor' | 'create'
  /** Кнопка «Скачать .docx» (только в редакторе). */
  docx?: { downloading: boolean; onDownload: () => void }
  /** Тема снаружи (редактор хранит её в настройках документа); без этих
   *  пропсов хедер управляет темой сам через localStorage. */
  theme?: 'light' | 'dark'
  onToggleTheme?: () => void
}

/**
 * Единый хедер всех страниц (дизайн Texturn v2): логотип Newsreader,
 * навигация «Редактор» / «Создать с ИИ» (градиент), справа — «Скачать .docx»
 * (редактор), переключатель темы и аватар-градиент (→ /profile) или вход.
 */
export function AppHeader({ active, docx, theme, onToggleTheme }: AppHeaderProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [ownTheme, setOwnTheme] = useState(() => effectiveTheme(loadPersisted().s.theme))

  const shownTheme = theme ?? ownTheme
  const toggleTheme =
    onToggleTheme ??
    (() => {
      const next = ownTheme === 'dark' ? 'light' : 'dark'
      const persisted = loadPersisted()
      savePersisted({ md: persisted.md, s: { ...persisted.s, theme: next } })
      applyTheme(next)
      setOwnTheme(next)
    })

  return (
    <header
      className="sticky top-0 z-30 flex h-14 flex-shrink-0 items-center gap-3 border-b px-4 sm:px-7"
      style={{
        background: 'var(--header-bg)',
        borderColor: 'var(--header-line)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <button
        onClick={() => navigate('/')}
        title="Texturn — на главную"
        className="cursor-pointer border-none bg-transparent p-0 font-serif text-[20px] font-bold text-ink"
      >
        Texturn
      </button>
      <span className="h-[22px] w-px flex-shrink-0 bg-line" />

      <nav className="flex items-center gap-2">
        <button
          onClick={() => navigate('/editor')}
          className="flex cursor-pointer items-center gap-[7px] rounded-full border border-edge px-3.5 py-[7px] text-[13px] font-semibold transition-colors hover:bg-hover"
          style={{
            background: active === 'editor' ? 'var(--hover)' : 'transparent',
            color: active === 'editor' ? 'var(--ink)' : 'var(--soft)',
          }}
        >
          <SquarePenIcon />
          <span className="hidden sm:inline">Редактор</span>
        </button>
        <button
          onClick={() => navigate('/create')}
          className="ai-gradient flex cursor-pointer items-center gap-[7px] rounded-full border-none px-3.5 py-[7px] text-[13px] font-semibold text-white transition-[filter,box-shadow] duration-200 hover:brightness-110"
          style={{ boxShadow: '0 1px 2px rgba(123,82,214,.16), 0 3px 8px rgba(216,75,176,.14)' }}
        >
          <SparklesIcon size={14} />
          <span className="hidden sm:inline">Создать с ИИ</span>
        </button>
      </nav>
      <div className="flex-1" />

      {docx && (
        <button
          onClick={docx.onDownload}
          title="Скачать документ DOCX"
          className="flex cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-full border-none bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-dark"
        >
          {docx.downloading ? <Spinner /> : <DownloadIcon />}
          <span>{docx.downloading ? 'Готовим файл…' : 'Скачать .docx'}</span>
        </button>
      )}

      <button
        onClick={toggleTheme}
        title={shownTheme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        className="flex h-[38px] w-[38px] flex-shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-edge bg-surface text-soft transition-colors hover:text-accent"
      >
        {shownTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
      {user ? (
        <button
          onClick={() => navigate('/profile')}
          title="Профиль"
          className="flex h-[38px] w-[38px] flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-none text-xs font-bold text-white"
          style={{ background: avatarGradient(user.name) }}
        >
          {initialsOf(user.name)}
        </button>
      ) : (
        <button
          onClick={() => navigate('/login')}
          title="Войти"
          className="flex h-[38px] w-[38px] flex-shrink-0 cursor-pointer items-center justify-center rounded-full border border-edge bg-surface text-soft transition-colors hover:text-accent"
        >
          <UserIcon />
        </button>
      )}
    </header>
  )
}
