import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api'
import { useAuth } from '../auth/AuthContext'
import { LogInIcon } from '../components/icons'
import { TextField } from '../components/ui'

/**
 * Вход/регистрация (дизайн v2): центрированная карточка с логотипом
 * Newsreader, сегментом Вход/Регистрация и кнопкой «Продолжить как гость».
 */
export function AuthPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const resp =
        mode === 'login'
          ? await authApi.login(email, password)
          : await authApi.register(name, email, password)
      signIn(resp.token, resp.user)
      navigate('/editor')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center overflow-y-auto bg-paper p-6 text-ink antialiased">
      <div className="animate-pop-in w-[400px] max-w-full">
        <div
          className="rounded-[18px] border border-line bg-surface p-6"
          style={{ boxShadow: '0 1px 2px rgba(61,57,41,.04), 0 10px 36px rgba(61,57,41,.07)' }}
        >
          <button
            onClick={() => navigate('/')}
            title="Texturn — на главную"
            className="mx-auto mb-5 flex cursor-pointer border-none bg-transparent p-0 font-serif text-2xl font-bold text-ink"
          >
            Texturn
          </button>

          <div className="flex gap-[3px] rounded-[11px] bg-hover p-[3px]">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setError(null)
                }}
                className="flex-1 cursor-pointer rounded-[9px] border-none py-2 text-[12.5px] font-semibold transition-all"
                style={{
                  color: mode === m ? 'var(--ink)' : 'var(--muted)',
                  background: mode === m ? 'var(--seg-active)' : 'transparent',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
                }}
              >
                {m === 'login' ? 'Вход' : 'Регистрация'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-[13px] pt-5">
            {mode === 'register' && (
              <TextField
                label="Имя"
                placeholder="Иван Иванов"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            )}
            <TextField
              label="Электронная почта"
              type="email"
              placeholder="you@university.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <TextField
              label="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              placeholder={mode === 'register' ? 'Минимум 8 символов' : '••••••••'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {error && <div className="text-xs text-danger">{error}</div>}
            <button
              type="submit"
              disabled={busy}
              className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-accent py-3 text-[13px] font-medium text-white transition-[background,transform] duration-200 hover:-translate-y-px hover:bg-accent-dark disabled:opacity-60"
              style={{
                boxShadow:
                  '0 1px 2px rgba(61,57,41,.12), 0 6px 16px color-mix(in srgb, var(--accent) 20%, transparent)',
              }}
            >
              <LogInIcon />
              {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/editor')}
              className="flex cursor-pointer items-center justify-center gap-[7px] rounded-full border border-edge bg-transparent py-[11px] text-[13px] font-medium text-soft transition-colors hover:bg-hover"
            >
              ← Продолжить как гость
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
