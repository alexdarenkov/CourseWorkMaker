import { ReactNode, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../hooks/useToast'
import { loadPersisted, savePersisted } from '../lib/storage'
import { applyTheme, effectiveTheme } from '../lib/theme'
import { MoonIcon, SunIcon } from './icons'
import { Toast } from './Toast'
import { IconButton } from './ui'
import { UserModal } from './UserModal'

/**
 * Общая шапка страниц вне редактора (главная, /create): бренд Texturn,
 * переключатель темы и профиль/вход. Самодостаточна: сама держит UserModal
 * и тост, тему пишет в localStorage (настройка `theme` редактора).
 */
export function SiteHeader({ left }: { left?: ReactNode }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast, showToast } = useToast()
  const [userOpen, setUserOpen] = useState(false)
  const [theme, setTheme] = useState(() => effectiveTheme(loadPersisted().s.theme))

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const persisted = loadPersisted()
    savePersisted({ md: persisted.md, s: { ...persisted.s, theme: next } })
    applyTheme(next)
    setTheme(next)
  }

  const initials = user
    ? user.name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : null

  return (
    <header className="z-10 flex h-14 flex-shrink-0 items-center gap-2 px-6">
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
      {left}
      <div className="flex-1" />
      <IconButton
        title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        onClick={toggleTheme}
        size={34}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </IconButton>
      {user ? (
        <button
          onClick={() => setUserOpen(true)}
          title="Профиль"
          className="flex cursor-pointer items-center justify-center rounded-full border-none text-[11px] font-bold tracking-wide"
          style={{ width: 32, height: 32, background: 'var(--avatar)', color: 'var(--warm)' }}
        >
          {initials}
        </button>
      ) : (
        <button
          onClick={() => navigate('/login')}
          className="cursor-pointer rounded-full border border-edge bg-transparent px-4 py-1.5 text-[12.5px] font-semibold text-soft hover:bg-hover hover:text-ink"
        >
          Войти
        </button>
      )}
      {userOpen && <UserModal onClose={() => setUserOpen(false)} onToast={showToast} />}
      {toast && <Toast message={toast} />}
    </header>
  )
}
