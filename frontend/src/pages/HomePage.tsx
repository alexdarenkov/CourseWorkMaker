import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { FileTextIcon, SparklesIcon, UploadIcon } from '../components/icons'
import { SiteHeader } from '../components/SiteHeader'
import { setHomeAction } from '../lib/handoff'
import { SAMPLE_MD } from '../lib/sample'
import { loadPersisted, savePersisted } from '../lib/storage'

/** Заголовок черновика для карточки «Продолжить» — первый `#`-заголовок. */
function draftTitle(md: string): string {
  const m = md.match(/^#\s+(.+?)\s*$/m)
  return m ? m[1] : 'ваш черновик'
}

/** Карточка-действие главной страницы. */
function ActionCard(props: {
  icon: React.ReactNode
  title: string
  desc: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={props.onClick}
      className="flex w-60 cursor-pointer flex-col items-start gap-2 rounded-2xl border border-edge p-5 text-left backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-accent"
      style={{
        background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
        boxShadow: '0 2px 12px rgba(61,57,41,.07)',
      }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ color: 'var(--warm)', background: 'var(--warm-bg)' }}
      >
        {props.icon}
      </span>
      <span className="text-[14px] font-bold text-ink">{props.title}</span>
      <span className="text-[12px] leading-snug text-muted">{props.desc}</span>
      {props.hint && <span className="text-[10.5px] text-faint">{props.hint}</span>}
    </button>
  )
}

const tan = (p: number) => `color-mix(in srgb, var(--warm) ${p}%, var(--paper))`

/**
 * Главная: лендинг-launcher (AI-10). Центрированный hero, по верхнему и
 * нижнему краю — слоистые тёплые волны; три входа — генерация с ИИ (/create),
 * пустой документ, загрузка .md/.zip; при черновике — «Продолжить работу».
 */
export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  // Черновик читается при каждом рендере главной — после возврата из
  // редактора состояние актуально.
  const persisted = loadPersisted()
  const hasDraft = Boolean(persisted.md.trim()) && persisted.md !== SAMPLE_MD

  const startEmpty = () => {
    if (hasDraft && !window.confirm('Начать пустой документ? Текущий черновик будет удалён.')) {
      return
    }
    savePersisted({ md: '', s: persisted.s })
    navigate('/editor')
  }

  const startUpload = (file: File) => {
    setHomeAction({ kind: 'upload', file })
    navigate('/editor')
  }

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden bg-paper text-ink antialiased"
      style={{
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif",
      }}
    >
      {/* Волны по нижнему краю (три слоя тёплых тонов) */}
      <svg
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 w-full"
        viewBox="0 0 1440 240"
        preserveAspectRatio="none"
        style={{ height: 220 }}
      >
        <path
          d="M0 118 C 220 58, 440 178, 720 128 C 1000 78, 1220 168, 1440 98 L1440 240 L0 240 Z"
          fill={tan(10)}
        />
        <path
          d="M0 158 C 260 98, 500 208, 780 158 C 1060 108, 1260 198, 1440 138 L1440 240 L0 240 Z"
          fill={tan(20)}
        />
        <path
          d="M0 200 C 280 150, 560 236, 860 196 C 1140 160, 1300 224, 1440 184 L1440 240 L0 240 Z"
          fill="#d97757"
          opacity="0.5"
        />
      </svg>

      {/* Волна по верхнему краю (спокойнее, один-два слоя) */}
      <svg
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 w-full"
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
        style={{ height: 150 }}
      >
        <path
          d="M0 92 C 260 132, 520 42, 800 82 C 1080 122, 1260 52, 1440 92 L1440 0 L0 0 Z"
          fill={tan(9)}
        />
        <path
          d="M0 54 C 300 94, 560 14, 860 50 C 1140 84, 1300 28, 1440 58 L1440 0 L0 0 Z"
          fill={tan(17)}
        />
      </svg>

      <SiteHeader />

      <main className="z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <h1 className="max-w-2xl text-center text-[38px] font-bold leading-[1.15] tracking-tight">
          Просто сделай{' '}
          <span style={{ color: 'var(--warm)' }}>диплом, курсовую или реферат</span> по ГОСТ
        </h1>
        <p className="mt-4 max-w-xl text-center text-[15px] leading-relaxed text-muted">
          Пишете в Markdown — справа живое постраничное превью «как в Word» и точный
          экспорт в DOCX. ИИ-агент может составить план и написать работу целиком.
        </p>

        {hasDraft && (
          <button
            onClick={() => navigate('/editor')}
            className="mt-9 flex cursor-pointer items-center gap-2.5 rounded-full border-none bg-accent px-6 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-accent-dark"
          >
            ▸ Продолжить работу
            <span className="max-w-[260px] truncate font-normal opacity-80">
              «{draftTitle(persisted.md)}»
            </span>
          </button>
        )}

        <div className="mt-9 flex flex-wrap justify-center gap-4">
          <ActionCard
            icon={<SparklesIcon size={17} />}
            title="Создать с ИИ"
            desc="Опишите тему — агент составит план, напишет разделы и проверит результат"
            hint={user ? undefined : 'нужен вход в аккаунт'}
            onClick={() => navigate('/create')}
          />
          <ActionCard
            icon={<FileTextIcon size={17} />}
            title="Пустой документ"
            desc="Начать с чистого листа и писать в Markdown самостоятельно"
            onClick={startEmpty}
          />
          <ActionCard
            icon={<UploadIcon size={17} />}
            title="Загрузить .md / .zip"
            desc="Продолжить свой файл; .zip с картинками откроется без потерь"
            onClick={() => fileRef.current?.click()}
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,.zip,text/markdown,text/plain,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) startUpload(f)
            e.target.value = ''
          }}
        />
      </main>
    </div>
  )
}
