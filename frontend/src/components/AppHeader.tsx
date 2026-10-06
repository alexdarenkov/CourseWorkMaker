import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadEditorDraft, savePersisted } from '../lib/storage'
import { applyTheme, effectiveTheme } from '../lib/theme'
import { Brand, Button } from './ui'
import { DownloadIcon, MoonIcon, SquarePenIcon, SunIcon } from './icons'

interface AppHeaderProps {
  /** Активный пункт навигации (подсвечивается фоном). */
  active?: 'editor'
  /** Кнопка «Скачать .docx» (только в редакторе). */
  docx?: { downloading: boolean; onDownload: () => void }
  /** Тема снаружи (редактор хранит её в настройках документа); без этих
   *  пропсов хедер управляет темой сам через localStorage. */
  theme?: 'light' | 'dark'
  onToggleTheme?: () => void
}

/**
 * Единый хедер всех страниц (дизайн Texturn v2): логотип Newsreader,
 * навигация «Редактор», справа — «Скачать .docx»
 * (редактор) и переключатель темы.
 */
export function AppHeader({ active, docx, theme, onToggleTheme }: AppHeaderProps) {
  const navigate = useNavigate()
  const [ownTheme, setOwnTheme] = useState(() => effectiveTheme(loadEditorDraft().s.theme))

  const shownTheme = theme ?? ownTheme
  const toggleTheme =
    onToggleTheme ??
    (() => {
      const next = ownTheme === 'dark' ? 'light' : 'dark'
      const persisted = loadEditorDraft()
      savePersisted({ md: persisted.md, s: { ...persisted.s, theme: next } })
      applyTheme(next)
      setOwnTheme(next)
    })

  return (
    <header className="app-header">
      <Brand onClick={() => navigate('/')} />
      <span className="header-divider" />
      {/* На самой странице редактора кнопка перехода в редактор избыточна —
          на узких экранах её прячем, освобождая место шапке. */}
      <nav className={'items-center gap-2 ' + (active === 'editor' ? 'hidden sm:flex' : 'flex')}>
        <button
          type="button"
          aria-label="Редактор"
          aria-current={active === 'editor' ? 'page' : undefined}
          onClick={() => navigate('/editor')}
          className="nav-pill"
        >
          <SquarePenIcon size={13} />
          <span className="hidden sm:inline">Редактор</span>
        </button>
      </nav>
      <div className="flex-1" />

      {docx && (
        <Button
          onClick={docx.onDownload}
          busy={docx.downloading}
          title="Скачать .docx"
          variant="primary"
          size="sm"
        >
          {!docx.downloading && <DownloadIcon size={15} strokeWidth={2} />}
          <span className="tx-hide-narrow">{docx.downloading ? 'Готовим файл…' : 'Скачать .docx'}</span>
        </Button>
      )}

      <button
        type="button"
        onClick={toggleTheme}
        title="Тёмная / светлая тема"
        aria-label={shownTheme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        className="header-round header-round--square"
      >
        {shownTheme === 'dark' ? <SunIcon size={16} strokeWidth={2} /> : <MoonIcon size={16} strokeWidth={2} />}
      </button>
    </header>
  )
}
