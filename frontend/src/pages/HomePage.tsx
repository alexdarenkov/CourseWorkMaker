import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { AsciiBackdrop } from '../components/AsciiBackdrop'
import { AppHeader } from '../components/AppHeader'
import { SquarePenIcon } from '../components/icons'

function FeatureGallery() {
  return (
    <div className="home-features">
      <div className="home-feature">
        <div className="home-feature-art" aria-hidden="true">
          <div className="home-bars">
            <span style={{ height: '38%', opacity: 0.35 }} />
            <span style={{ height: '68%', opacity: 0.55 }} />
            <span style={{ height: '52%', opacity: 0.4 }} />
            <span style={{ height: '88%' }} />
          </div>
        </div>
        <span>Рисунки</span>
      </div>
      <div className="home-feature">
        <div className="home-feature-art" aria-hidden="true">
          <svg viewBox="0 0 72 42" fill="none" stroke="var(--accent)" strokeWidth="1.6">
            <rect x="3" y="4" width="24" height="13" rx="2" fill="var(--accent-bg)" />
            <rect x="45" y="25" width="24" height="13" rx="2" fill="var(--accent-bg)" />
            <path d="M15 17v9a5 5 0 0 0 5 5h25" strokeLinecap="round" />
          </svg>
        </div>
        <span>Схемы</span>
      </div>
      <div className="home-feature">
        <div className="home-feature-art" aria-hidden="true">
          <div className="home-table">
            {[0, 1, 2, 3].map((row) => (
              <div key={row}>
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        </div>
        <span>Таблицы</span>
      </div>
      <div className="home-feature">
        <div className="home-feature-art" aria-hidden="true">
          <span className="formula">
            E&nbsp;=&nbsp;mc<sup>2</sup>
          </span>
        </div>
        <span>Формулы</span>
      </div>
    </div>
  )
}

/** Мини-страница A4 в макете окна редактора (правая половина hero). */
function MockPage() {
  return (
    <div
      className="w-full max-w-[300px] overflow-hidden bg-white text-black"
      style={{
        aspectRatio: '210/297',
        borderRadius: 2,
        boxShadow: '0 2px 8px rgba(28,28,26,.14), 0 14px 36px rgba(28,28,26,.12)',
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
        <div style={{ lineHeight: 1.15 }}>Рисунок 1 – График функции f(x) = x²</div>
      </div>
    </div>
  )
}

/** Макет окна редактора в стиле macOS (правая половина hero, клик → /editor). */
function MockWindow({ onClick }: { onClick: () => void }) {
  return (
    <div
      data-ascii-clear
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Открыть редактор"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="home-window"
    >
      <div className="home-window-bar">
        <i style={{ background: 'var(--window-red)' }} />
        <i style={{ background: 'var(--window-yellow)' }} />
        <i style={{ background: 'var(--window-green)' }} />
        <span>Texturn</span>
      </div>
      <div className="home-window-body">
        <div className="home-window-code">
          <div>
            <span style={{ color: 'var(--sx-dim)' }}>#</span>{' '}
            <span style={{ color: 'var(--sx-head)' }}>Введение</span>
          </div>
          <div>Актуальность обусловлена</div>
          <div>ростом объёма данных. На</div>
          <div>
            <span style={{ color: 'var(--sx-dim)' }}>**</span>
            <span style={{ color: 'var(--sx-bold)' }}>рисунке&nbsp;1</span>
            <span style={{ color: 'var(--sx-dim)' }}>**</span> показана
          </div>
          <div>
            зависимость <span style={{ color: 'var(--sx-math)' }}>$f(x)$</span>.
          </div>
          <div style={{ color: 'var(--sx-math)' }}>{'$$ S = \\int_0^1 f(x)\\,dx $$'}</div>
          <div>
            где <span style={{ color: 'var(--sx-math)' }}>$S$</span> — площадь.
          </div>
          <div>
            <span style={{ color: 'var(--sx-caption)' }}>Рисунок:</span> График f(x)
          </div>
          <div>
            <span style={{ color: 'var(--sx-fence)' }}>```chart</span>
            <span className="tx-caret" />
          </div>
        </div>
        <div className="home-window-desk">
          <MockPage />
        </div>
      </div>
    </div>
  )
}

/**
 * Главная: заголовок, миниатюры возможностей и переход в редактор; справа макет окна редактора.
 * Загрузка своего .md/.zip живёт в тулбаре редактора.
 */
export function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="texturn-scroll">
      <div className="texturn-page">
        <AsciiBackdrop />
        <AppHeader />
        <main className="home-content">
          <div className="home-hero">
            <div className="home-copy" data-ascii-clear>
              <h1 className="home-title">
                Курсовые и дипломы <span className="italic text-accent">без боли</span> с
                оформлением
              </h1>
              <p className="home-description">
                Пишете в Markdown — справа живое постраничное превью с применением ГОСТ.
                Проверяйте оформление и скачивайте готовую работу в DOCX.
              </p>
              <FeatureGallery />
              <div className="home-actions">
                <Button variant="secondary" onClick={() => navigate('/editor')}>
                  <SquarePenIcon size={14} />Редактор
                </Button>
              </div>
            </div>

            <MockWindow onClick={() => navigate('/editor')} />
          </div>
        </main>
      </div>
    </div>
  )
}
