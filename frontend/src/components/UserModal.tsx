import { useState } from 'react'
import { authApi } from '../api'
import { useAuth } from '../auth/AuthContext'
import { saveToken } from '../lib/storage'
import { CloseIcon } from './icons'
import { TextField } from './ui'

interface UserModalProps {
  onClose: () => void
  onToast: (msg: string) => void
}

export function UserModal({ onClose, onToast }: UserModalProps) {
  const { user, setUser, signOut } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [pwCur, setPwCur] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user) return null

  const initials = (user.name || 'U')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (name !== user.name || email !== user.email) {
        const resp = await authApi.updateProfile(name, email)
        saveToken(resp.token)
        setUser(resp.user)
      }
      if (pwCur && pwNew) {
        await authApi.changePassword(pwCur, pwNew)
        setPwCur('')
        setPwNew('')
      }
      onToast('Профиль обновлён')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Не удалось сохранить профиль')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--overlay)', backdropFilter: 'blur(3px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-pop-in overflow-y-auto bg-surface text-ink p-[22px]"
        style={{
          width: 440,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: '84vh',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(61,57,41,.28)',
        }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="flex items-center justify-center rounded-full text-lg font-bold tracking-wide"
            style={{ width: 52, height: 52, background: 'var(--avatar)', color: 'var(--warm)' }}
          >
            {initials}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="text-[15.5px] font-bold tracking-tight">{user.name}</div>
            <div className="truncate text-[12.5px] text-muted">{user.email}</div>
          </div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            title="Закрыть"
            className="flex h-[30px] w-[30px] flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-hover text-soft hover:bg-hover-2"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-3 pt-5">
          <TextField label="Имя и фамилия" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            label="Электронная почта"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="my-5 mb-4 h-px bg-hover" />
        <div className="pb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-faint">
          Смена пароля
        </div>
        <div className="flex flex-col gap-3">
          <TextField
            label="Текущий пароль"
            type="password"
            placeholder="••••••••"
            value={pwCur}
            onChange={(e) => setPwCur(e.target.value)}
          />
          <TextField
            label="Новый пароль"
            type="password"
            placeholder="Минимум 8 символов"
            value={pwNew}
            onChange={(e) => setPwNew(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2.5 pt-[22px]">
          <button
            onClick={() => {
              signOut()
              onClose()
              onToast('Вы вышли из аккаунта')
            }}
            className="cursor-pointer rounded-full border border-warm-border bg-transparent px-3.5 py-2 text-[12.5px] font-semibold text-danger hover:bg-warm-bg"
          >
            Выйти из аккаунта
          </button>
          <div className="flex-1" />
          <button
            onClick={save}
            disabled={busy}
            className="cursor-pointer rounded-full border-none bg-accent px-[18px] py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-dark disabled:opacity-60"
          >
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
