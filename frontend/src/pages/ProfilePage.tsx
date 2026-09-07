import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/AppHeader'
import { CardIcon, LogOutIcon, PenIcon, PlusIcon, WalletIcon } from '../components/icons'
import { Toast } from '../components/Toast'
import { ModalCloseButton, ModalShell, TextField } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { avatarGradient, initialsOf } from '../lib/avatar'
import { saveToken } from '../lib/storage'

/** Баланс — UI-заглушка (бэкенда платежей нет): значение живёт в localStorage. */
const BALANCE_KEY = 'md2docx:balanceStub'

const loadBalance = () => Number(localStorage.getItem(BALANCE_KEY)) || 0
const saveBalance = (v: number) => localStorage.setItem(BALANCE_KEY, String(v))

/** Модалка «Пополнить баланс» (демо: платежи не подключены). */
function TopupModal(props: { onClose: () => void; onTopup: (amount: number) => void }) {
  const [amount, setAmount] = useState('')
  const value = Math.max(0, Math.floor(Number(amount)))

  return (
    <ModalShell onClose={props.onClose} width={460} maxHeight="calc(100vh - 48px)" panelClassName="overflow-y-auto">
      <div className="flex items-start gap-4 px-7 pb-1.5 pt-[26px]">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 font-serif text-[28px] font-normal" style={{ letterSpacing: '-.015em' }}>
            Пополнить баланс
          </h2>
          <p className="mb-0 mt-1.5 text-[13px] leading-normal text-soft">
            Деньги тратятся только на генерацию с ИИ. Никакой подписки.
          </p>
        </div>
        <ModalCloseButton onClose={props.onClose} />
      </div>
      <div className="px-7 pt-[18px]">
        <div className="mb-2.5 text-[11.5px] font-medium text-muted">Сумма пополнения</div>
        <div className="flex items-center gap-2 rounded-xl border border-edge bg-surface px-3.5">
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500"
            className="min-w-0 flex-1 border-none bg-transparent py-3 text-[15px] text-ink outline-none"
          />
          <span className="text-[15px] text-muted">₽</span>
        </div>
      </div>
      <div className="px-7 pb-[26px] pt-[18px]">
        <button
          onClick={() => value > 0 && props.onTopup(value)}
          disabled={value <= 0}
          className="flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-full border-none bg-accent py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
        >
          <CardIcon />
          Пополнить на {value > 0 ? value : '…'} ₽
        </button>
        <div className="mt-3 text-center text-[11.5px] text-muted">
          Оплата картой РФ · деньги не сгорают
        </div>
      </div>
    </ModalShell>
  )
}

/**
 * Страница профиля (/profile, дизайн v2): карточка пользователя (просмотр /
 * редактирование имени, почты и пароля) + карточка баланса. Баланс и
 * пополнение — UI-заглушка: платёжного бэкенда пока нет.
 */
export function ProfilePage() {
  const navigate = useNavigate()
  const { user, setUser, signOut, loading } = useAuth()
  const { toast, showToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pwCur, setPwCur] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [busy, setBusy] = useState(false)
  const [balance, setBalance] = useState(loadBalance)
  const [topupOpen, setTopupOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) navigate('/login')
  }, [loading, user, navigate])

  if (!user) return null

  const startEdit = () => {
    setName(user.name)
    setEmail(user.email)
    setPwCur('')
    setPwNew('')
    setEditing(true)
  }

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
      }
      setEditing(false)
      showToast('Профиль обновлён')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось сохранить профиль')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-screen overflow-y-auto bg-paper text-ink antialiased">
      <AppHeader />
      <main className="mx-auto max-w-[960px] px-4 pb-20 pt-8 sm:px-12">
        <div className="grid grid-cols-1 gap-5">
          {/* -------- карточка пользователя -------- */}
          <div className="rounded-[18px] border border-edge bg-surface p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-4">
              <span
                className="flex h-[60px] w-[60px] flex-shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
                style={{ background: avatarGradient(user.name) }}
              >
                {initialsOf(user.name)}
              </span>
              <div className="min-w-0">
                <div className="font-serif text-xl font-medium">{user.name}</div>
                <div className="truncate text-[13px] text-muted">{user.email}</div>
              </div>
              <div className="flex-1" />
              {!editing && (
                <>
                  <button
                    onClick={startEdit}
                    className="flex cursor-pointer items-center gap-[7px] rounded-full border border-edge bg-paper px-4 py-[9px] text-[13px] font-medium text-ink transition-colors hover:bg-hover"
                  >
                    <PenIcon />
                    Изменить
                  </button>
                  <button
                    onClick={() => {
                      signOut()
                      navigate('/')
                    }}
                    title="Выйти из аккаунта"
                    className="flex cursor-pointer items-center gap-[7px] rounded-full border-none px-4 py-[9px] text-[13px] font-medium text-white transition-[background,transform] duration-200 hover:-translate-y-px"
                    style={{ background: 'var(--danger)', boxShadow: '0 1px 2px rgba(61,57,41,.1), 0 6px 14px rgba(214,68,53,.24)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--danger-dark)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--danger)')}
                  >
                    <LogOutIcon />
                    Выйти
                  </button>
                </>
              )}
            </div>

            {!editing ? (
              <div
                className="mt-[22px] grid gap-x-6 border-t border-line pt-[22px]"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
              >
                <div className="py-2.5">
                  <div className="text-[11.5px] text-muted">Имя</div>
                  <div className="mt-1 text-sm">{user.name}</div>
                </div>
                <div className="py-2.5">
                  <div className="text-[11.5px] text-muted">Электронная почта</div>
                  <div className="mt-1 text-sm">{user.email}</div>
                </div>
                <div className="py-2.5">
                  <div className="text-[11.5px] text-muted">Пароль</div>
                  <div className="mt-1 text-sm">••••••••••</div>
                </div>
              </div>
            ) : (
              <div className="mt-[22px] flex flex-col gap-3.5 border-t border-line pt-[22px]">
                <TextField label="Имя" value={name} onChange={(e) => setName(e.target.value)} />
                <TextField
                  label="Электронная почта"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <TextField
                  label="Текущий пароль"
                  type="password"
                  placeholder="Нужен только для смены пароля"
                  value={pwCur}
                  onChange={(e) => setPwCur(e.target.value)}
                />
                <TextField
                  label="Новый пароль"
                  type="password"
                  placeholder="Оставьте пустым, чтобы не менять"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                />
                <div className="mt-1 flex gap-2.5">
                  <button
                    onClick={() => void save()}
                    disabled={busy}
                    className="cursor-pointer rounded-full border-none bg-accent px-[22px] py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-60"
                  >
                    {busy ? 'Сохраняем…' : 'Сохранить'}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="cursor-pointer rounded-full border border-edge bg-paper px-[22px] py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-hover"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* -------- карточка баланса (UI-заглушка) -------- */}
          <div className="relative overflow-hidden rounded-[18px] border border-edge bg-surface p-5 sm:p-[26px]">
            <div className="relative flex flex-wrap items-center gap-4">
              <span
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-muted"
                style={{ background: 'color-mix(in srgb, var(--hover) 55%, var(--surface))' }}
              >
                <WalletIcon />
              </span>
              <div>
                <div className="text-[10px] font-medium uppercase text-muted" style={{ letterSpacing: '.04em' }}>
                  Текущий баланс
                </div>
                <div
                  className="mt-1.5 font-serif text-[30px] font-semibold leading-none"
                  style={{ letterSpacing: '-.01em' }}
                >
                  {balance} <span className="text-soft" style={{ fontSize: '.62em' }}>₽</span>
                </div>
              </div>
              <div className="flex-1" />
              <button
                onClick={() => setTopupOpen(true)}
                className="flex cursor-pointer items-center gap-[7px] rounded-full border-none bg-accent px-4 py-[9px] text-[13px] font-medium text-white transition-[background,transform] duration-200 hover:-translate-y-px hover:bg-accent-dark"
                style={{ boxShadow: '0 1px 2px rgba(61,57,41,.12), 0 6px 16px color-mix(in srgb, var(--accent) 22%, transparent)' }}
              >
                <PlusIcon size={14} />
                Пополнить
              </button>
            </div>
            <div className="relative mt-[18px] border-t border-line pt-4 text-xs leading-normal text-muted">
              Списывается только за реальную генерацию — без ежемесячных платежей.
            </div>
          </div>
        </div>
      </main>

      {topupOpen && (
        <TopupModal
          onClose={() => setTopupOpen(false)}
          onTopup={(amount) => {
            // Заглушка: платёжного бэкенда нет, значение только в localStorage.
            const next = balance + amount
            saveBalance(next)
            setBalance(next)
            setTopupOpen(false)
            showToast('Баланс пополнен (демо: платежи ещё не подключены)')
          }}
        />
      )}
      {toast && <Toast message={toast} />}
    </div>
  )
}
