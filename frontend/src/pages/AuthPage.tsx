import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api'
import { useAuth } from '../auth/AuthContext'
import { TextField } from '../components/ui'

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
    <div
      className="flex h-screen items-center justify-center bg-paper text-ink antialiased"
      style={{
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif",
      }}
    >
      <div className="animate-pop-in w-[400px] max-w-[calc(100vw-48px)]">
        <div className="flex items-center justify-center gap-2.5 pb-7">
          <div
            className="flex items-center justify-center rounded-lg bg-ink text-paper"
            style={{
              width: 34,
              height: 34,
              fontFamily: "'Times New Roman',serif",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            T
          </div>
          <div className="flex flex-col gap-px">
            <div className="font-mono text-[15px] font-bold tracking-wide">Texturn</div>
            <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted">
              ГОСТ 7.32—2017
            </div>
          </div>
        </div>

        <div
          className="rounded-[18px] bg-surface p-6"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,.12)' }}
        >
          <div className="flex rounded-[10px] bg-hover p-[2.5px]">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setError(null)
                }}
                className="flex-1 cursor-pointer rounded-lg border-none py-[7px] text-[12.5px] font-semibold transition-all"
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

          <form onSubmit={submit} className="flex flex-col gap-3 pt-5">
            {mode === 'register' && (
              <TextField
                label="Имя и фамилия"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            )}
            <TextField
              label="Электронная почта"
              type="email"
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
              placeholder={mode === 'register' ? 'Минимум 8 символов' : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {error && (
              <div className="text-xs" style={{ color: 'var(--danger)' }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="mt-1 cursor-pointer rounded-full border-none bg-accent py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-dark disabled:opacity-60"
            >
              {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </button>
          </form>
        </div>

        <button
          onClick={() => navigate('/editor')}
          className="mx-auto mt-5 block cursor-pointer border-none bg-transparent text-[12.5px] text-muted hover:text-ink"
        >
          ← Продолжить без входа (как гость)
        </button>
      </div>
    </div>
  )
}
