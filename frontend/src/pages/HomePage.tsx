import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { SparklesIcon, SquarePenIcon } from '../components/icons'
import { SAMPLE_MD } from '../lib/sample'
import { loadPersisted } from '../lib/storage'

/** Заголовок черновика для кнопки «Продолжить» — первый `#`-заголовок. */
function draftTitle(md: string): string {
  const m = md.match(/^#\s+(.+?)\s*$/m)
  return m ? m[1] : 'ваш черновик'
}

const FEATURES = [
  'Рисунки/Графики/Mermaid-схемы',
  'Таблицы',
  'Формулы LaTeX',
  'Содержание',
  'Титульный лист',
  'Список литературы',
]

/** Мини-страница A4 в макете окна редактора (правая половина hero). */
function MockPage() {
  return (
    <div
      className="w-full max-w-[300px] overflow-hidden rounded-sm bg-white text-black"
      style={{
        aspectRatio: '210/297',
        boxShadow: '0 2px 8px rgba(61,57,41,.14), 0 14px 36px rgba(61,57,41,.12)',
        padding: '22px 16px 22px 26px',
        fontFamily: "'Times New Roman',Times,serif",
        fontSize: 9,
        lineHeight: 1.725,
      }}
    >
      <div className="text-center font-bold">ВВЕДЕНИЕ</div>
      <div style={{ textAlign: 'justify', textIndent: 14 }}>
        Актуальность темы обусловлена ростом объёма данных. На рисунке&nbsp;1 показана
        зависимость <span className="italic">f(x)</span>.
      </div>
      <div>&nbsp;</div>
      <div className="flex items-center">
        <div className="w-6 flex-shrink-0" />
        <div className="flex-1 text-center italic">
          S ={' '}
          <span className="not-italic" style={{ fontSize: 13, verticalAlign: -2 }}>
            ∫
          </span>
          <span
            className="inline-flex flex-col align-middle"
            style={{ fontSize: 5.5, lineHeight: 1 }}
          >
            <span>1</span>
            <span>0</span>
          </span>{' '}
          f(x)&nbsp;dx
        </div>
        <div className="w-6 flex-shrink-0 text-right">(1)</div>
      </div>
      <div style={{ textAlign: 'left', textIndent: 14 }}>
        где <span className="italic">S</span> — площадь под кривой.
      </div>
      <div>&nbsp;</div>
      <div className="text-center">
        <div className="flex justify-center">
          <svg viewBox="0 0 150 82" style={{ width: '78%', overflow: 'visible' }}>
            <line x1="16" y1="8" x2="16" y2="66" stroke="#111" strokeWidth="0.8" />
            <line x1="16" y1="66" x2="140" y2="66" stroke="#111" strokeWidth="0.8" />
            <path d="M16 66 Q 80 63 140 12 L140 66 Z" fill="var(--accent)" opacity="0.15" />
            <path
              d="M16 66 Q 80 63 140 12"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div style={{ lineHeight: 1.15 }}>Рисунок 1 — График функции f(x) = x²</div>
      </div>
    </div>
  )
}

/** Макет окна редактора в стиле macOS (правая половина hero, клик → /editor). */
function MockWindow({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer overflow-hidden rounded-[14px] border border-edge"
      style={{
        background: 'var(--code-bg)',
        boxShadow: '0 1px 2px rgba(61,57,41,.05), 0 24px 64px rgba(61,57,41,.12)',
      }}
    >
      <div
        className="relative flex h-10 items-center gap-2 border-b border-edge px-[15px]"
        style={{ background: 'var(--preview-bar)' }}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: '#ff5f57' }} />
        <span className="h-3 w-3 rounded-full" style={{ background: '#febc2e' }} />
        <span className="h-3 w-3 rounded-full" style={{ background: '#28c840' }} />
        <span className="pointer-events-none absolute inset-x-0 text-center text-xs text-muted">
          Texturn
        </span>
      </div>
      <div className="grid grid-cols-2">
        <div
          className="border-r border-edge px-[15px] py-4 font-mono text-[11px] text-ink"
          style={{ background: 'var(--code-bg)', lineHeight: 1.9 }}
        >
          <div>
            <span style={{ color: 'var(--sx-dim)' }}>#</span>{' '}
            <span style={{ color: 'var(--sx-head)' }}>Введение</span>
          </div>
          <div>&nbsp;</div>
          <div>Актуальность обусловлена</div>
          <div>ростом объёма данных. На</div>
          <div>
            <span style={{ color: 'var(--sx-dim)' }}>**</span>
            <span style={{ color: 'var(--sx-head)' }}>рисунке&nbsp;1</span>
            <span style={{ color: 'var(--sx-dim)' }}>**</span> показана
          </div>
          <div>
            зависимость <span style={{ color: 'var(--sx-math)' }}>$f(x)$</span>.
          </div>
          <div>&nbsp;</div>
          <div style={{ color: 'var(--sx-math)' }}>{'$$ S = \\int_0^1 f(x)\\,dx $$'}</div>
          <div>&nbsp;</div>
          <div>
            где <span style={{ color: 'var(--sx-math)' }}>$S$</span> — площадь.
          </div>
          <div>&nbsp;</div>
          <div>
            <span style={{ color: 'var(--sx-caption)' }}>Рисунок:</span> График f(x)
          </div>
          <div>
            <span style={{ color: 'var(--sx-fence)' }}>```chart</span>
            <span className="tx-caret" />
          </div>
        </div>
        <div
          className="flex items-start justify-center px-3.5 py-4"
          style={{ background: 'var(--preview-bg)' }}
        >
          <MockPage />
        </div>
      </div>
    </div>
  )
}

/**
 * Главная (AI-10, дизайн v2): hero-грид — слева serif-заголовок, две CTA
 * («Создать с ИИ» и «В редактор») и строка фич; справа макет окна редактора.
 * Загрузка своего .md/.zip живёт в тулбаре редактора.
 */
export function HomePage() {
  const navigate = useNavigate()

  // Черновик читается при каждом рендере главной — после возврата из
  // редактора состояние актуально.
  const persisted = loadPersisted()
  const hasDraft = Boolean(persisted.md.trim()) && persisted.md !== SAMPLE_MD

  return (
    <div className="h-screen overflow-y-auto bg-paper text-ink antialiased">
      <AppHeader />
      <main
        className="mx-auto max-w-[1340px] px-5 pb-20 sm:px-12"
        style={{ paddingTop: 'clamp(28px, 4vw, 56px)' }}
      >
        <div
          className="grid items-center gap-8 lg:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)] lg:gap-12"
        >
          <div>
            <h1
              className="m-0 font-serif font-normal"
              style={{
                fontSize: 'clamp(42px, 5.6vw, 64px)',
                lineHeight: 1.03,
                letterSpacing: '-.02em',
                textWrap: 'balance',
              }}
            >
              Курсовые и дипломы <span className="italic text-accent">без боли</span> с
              оформлением
            </h1>
            <p className="mb-0 mt-[22px] max-w-[440px] text-[16px] leading-[1.65] text-soft">
              Пишете в Markdown — справа живое постраничное превью с применением ГОСТ.
              ИИ-агент составит план и напишет работу целиком.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate('/create')}
                className="ai-gradient flex cursor-pointer items-center gap-[9px] rounded-full border-none px-[30px] py-3.5 text-[15px] font-medium text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5"
                style={{ boxShadow: '0 1px 3px rgba(123,82,214,.18), 0 5px 14px rgba(216,75,176,.16)' }}
              >
                <SparklesIcon size={17} />
                Создать с ИИ
              </button>
              <button
                onClick={() => navigate('/editor')}
                className="flex cursor-pointer items-center gap-[9px] rounded-full border border-edge bg-surface px-7 py-3.5 text-[15px] font-medium text-ink transition-[transform,background] duration-200 hover:-translate-y-px hover:bg-hover"
              >
                <SquarePenIcon size={16} />В редактор
              </button>
            </div>
            {hasDraft && (
              <button
                onClick={() => navigate('/editor')}
                className="mt-5 flex cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-[13px] font-semibold text-accent hover:text-accent-dark"
              >
                ▸ Продолжить работу
                <span className="max-w-[300px] truncate font-normal text-muted">
                  «{draftTitle(persisted.md)}»
                </span>
              </button>
            )}
            <div className="mt-10 flex max-w-[520px] flex-wrap gap-x-5 gap-y-[9px] border-t border-line pt-[22px]">
              {FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2 text-[13px] text-muted">
                  <span className="h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                  {f}
                </div>
              ))}
            </div>
          </div>

          <MockWindow onClick={() => navigate('/editor')} />
        </div>
      </main>
    </div>
  )
}
