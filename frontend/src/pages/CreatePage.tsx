import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { aiApi, AiQuality, PlanSection } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/AppHeader'
import {
  CloseIcon,
  ListIcon,
  ListPlusIcon,
  PaperclipIcon,
  PlusIcon,
  SparklesIcon,
  Spinner,
} from '../components/icons'
import { Toggle } from '../components/ui'
import {
  applyPromptAnalysis,
  buildGenerateOptions,
  PromptAnalysis,
  ReportOptions,
  validatePrompt,
} from '../lib/aiPrompt'
import { setHomeAction } from '../lib/handoff'
import { SAMPLE_MD } from '../lib/sample'
import { loadPersisted } from '../lib/storage'

const TIERS: { id: AiQuality; label: string; hint: string }[] = [
  { id: 'fast', label: 'Быстро', hint: '~2–4 мин' },
  { id: 'balanced', label: 'Баланс', hint: '~4–7 мин' },
  { id: 'quality', label: 'Качество', hint: '~6–12 мин' },
]

// «Картинки из интернета» убраны из UI 2026-07-19 — include_web_images всегда false.
const TOGGLES: { key: keyof ReportOptions; label: string }[] = [
  { key: 'bib', label: 'Список литературы' },
  { key: 'tables', label: 'Таблицы' },
  { key: 'diagrams', label: 'Mermaid-схемы' },
  { key: 'formulas', label: 'Формулы' },
  { key: 'images', label: 'Графики (строит ИИ)' },
  { key: 'codeAppendix', label: 'Приложение с кодом' },
]

/** Кнопка-градиент нижней панели плана (общая для двух состояний). */
function PlanCta(props: { onClick: () => void; busy: boolean; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.busy}
      className="ai-gradient flex cursor-pointer items-center justify-center gap-[9px] rounded-full border-none px-[26px] py-3 text-sm font-medium text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 disabled:opacity-60"
      style={{ boxShadow: '0 1px 3px rgba(123,82,214,.18), 0 5px 14px rgba(216,75,176,.16)' }}
    >
      {props.busy ? <Spinner size={15} /> : props.icon}
      {props.label}
    </button>
  )
}

/**
 * Страница «Создать с ИИ» (/create, AI-10/AI-12) — единственная точка запуска
 * генерации. Слева параметры (тема, требования+файлы, качество, объём,
 * тогглы), справа панель «План работы»: «Создать план» → редактируемый список
 * разделов → «Сгенерировать работу» (план уходит в /generate полем plan).
 * Любое изменение параметров слева сбрасывает план.
 */
export function CreatePage() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [topic, setTopic] = useState('')
  const [reqs, setReqs] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [quality, setQuality] = useState<AiQuality>('balanced')
  const [opts, setOpts] = useState<ReportOptions>({
    pages: 15,
    bib: true,
    tables: true,
    diagrams: true,
    formulas: false,
    images: false,
    webImages: false,
    codeAppendix: false,
  })
  // Утверждаемый план (AI-12) + разбор промпта, по которому он строился —
  // тема/требования из разбора переиспользуются при генерации.
  const [plan, setPlan] = useState<PlanSection[] | null>(null)
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null)
  const [planning, setPlanning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Генерация требует аккаунта — гостя отправляем на вход.
  useEffect(() => {
    if (!loading && !user) navigate('/login')
  }, [loading, user, navigate])

  /** Изменение параметров слева обесценивает построенный план (AI-12). */
  const invalidatePlan = () => {
    setPlan(null)
    setAnalysis(null)
  }

  const combinedPrompt = () => (topic.trim() + '\n' + reqs.trim()).trim()

  const buildPlan = async () => {
    if (planning || starting) return
    const problem = validatePrompt(combinedPrompt(), 'new', true)
    if (problem) {
      setError(problem)
      return
    }
    setPlanning(true)
    setError(null)
    try {
      // Разбор промпта (AI-9): валидация по смыслу + автоподстройка тогглов
      // (fail-open при сбое, SEC-6).
      const a = await aiApi.analyzePrompt(combinedPrompt()).catch(() => null)
      if (a && !a.ok) {
        setError(a.reason || 'Это не похоже на тему работы — сформулируйте, о чём должен быть отчёт.')
        return
      }
      const { next } = applyPromptAnalysis(a, opts)
      const finalOpts = { ...next, webImages: false }
      setOpts(finalOpts)
      const { sections } = await aiApi.plan({
        topic: a?.topic || topic.trim(),
        requirements: a?.requirements || reqs.trim(),
        target_pages: finalOpts.pages,
        quality,
        include_bibliography: finalOpts.bib,
        include_code_appendix: finalOpts.codeAppendix,
      })
      setAnalysis(a)
      setPlan(sections)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось построить план')
    } finally {
      setPlanning(false)
    }
  }

  const start = async () => {
    if (starting || !plan) return
    if (!plan.some((s) => s.title.trim())) {
      setError('План пуст — добавьте хотя бы один раздел')
      return
    }
    setStarting(true)
    setError(null)
    try {
      const persisted = loadPersisted()
      const docEmpty = !persisted.md.trim() || persisted.md === SAMPLE_MD
      if (!docEmpty) {
        if (!window.confirm('Сгенерировать новую работу? Текущий текст в редакторе будет заменён.')) {
          setStarting(false)
          return
        }
      }
      const options = {
        ...buildGenerateOptions(analysis, combinedPrompt(), quality, { ...opts, webImages: false }),
        topic: analysis?.topic || topic.trim(),
        plan: plan.filter((s) => s.title.trim()),
      }
      const { jobId } = await aiApi.generate(options, files)
      setHomeAction({ kind: 'track', jobId, topic: options.topic })
      navigate('/editor')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось запустить генерацию')
      setStarting(false)
    }
  }

  const editSection = (i: number, patch: Partial<PlanSection>) =>
    setPlan((p) => p && p.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  return (
    <div className="flex h-screen flex-col bg-paper text-ink antialiased">
      <AppHeader active="create" />
      <div className="mx-auto w-full max-w-[1180px] min-h-0 flex-1 px-4 sm:px-12">
        <div className="grid h-full grid-cols-1 md:grid-cols-2">
          {/* -------- слева: параметры генерации -------- */}
          <div className="min-h-0 overflow-y-auto border-r border-line py-6 pr-7 md:pr-11">
            <h1 className="mb-5 mt-0 font-serif text-2xl font-normal" style={{ letterSpacing: '-.02em' }}>
              Параметры генерации
            </h1>

            <textarea
              rows={2}
              value={topic}
              disabled={starting}
              onChange={(e) => {
                setTopic(e.target.value)
                if (error) setError(null)
                invalidatePlan()
              }}
              placeholder="Название работы"
              className="w-full resize-none rounded-[7px] border border-edge bg-surface px-3.5 py-3 text-sm leading-normal text-ink outline-none transition-colors focus:bg-hover disabled:opacity-60"
            />

            <div className="mt-3 overflow-hidden rounded-[7px] border border-edge bg-surface transition-colors focus-within:bg-hover">
              <textarea
                rows={2}
                value={reqs}
                disabled={starting}
                onChange={(e) => {
                  setReqs(e.target.value)
                  if (error) setError(null)
                  invalidatePlan()
                }}
                placeholder="Основные требования к работе"
                className="w-full resize-none border-none bg-transparent px-3.5 py-3 text-sm leading-normal text-ink outline-none disabled:opacity-60"
              />
              {/* Файлы-источники: содержимое подаётся агенту в контекст (AI-2). */}
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-2.5 py-2">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    setFiles(Array.from(e.target.files ?? []).slice(0, 5))
                    e.target.value = ''
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={starting}
                  title="Прикрепить файлы-источники"
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent px-[9px] py-1 text-[11.5px] text-muted transition-colors hover:bg-hover hover:text-accent disabled:opacity-50"
                >
                  <PaperclipIcon size={14} />
                  Файлы
                </button>
                {files.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))}
                    title="Убрать файл"
                    className="cursor-pointer rounded-full border-none bg-hover px-2.5 py-1 text-[11px] text-soft"
                  >
                    {f.name} ×
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <div className="pt-2 text-xs font-medium text-danger">{error}</div>
            )}

            <div className="mt-3 flex gap-2">
              {TIERS.map((t) => {
                const on = quality === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setQuality(t.id)
                      invalidatePlan()
                    }}
                    className="flex flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-[7px] border px-2 py-[11px] transition-colors"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--edge)',
                      background: on ? 'var(--accent)' : 'var(--surface)',
                    }}
                  >
                    <span
                      className="text-[13px] font-semibold"
                      style={{ color: on ? '#fff' : 'var(--soft)' }}
                    >
                      {t.label}
                    </span>
                    <span
                      className="text-[10.5px]"
                      style={{ color: on ? 'rgba(255,255,255,.75)' : 'var(--muted)' }}
                    >
                      {t.hint}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-4 border-t border-line py-3.5">
              <div className="text-[13.5px] font-medium">Целевой объём</div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={40}
                  step={1}
                  value={opts.pages}
                  onChange={(e) => {
                    setOpts((o) => ({ ...o, pages: +e.target.value }))
                    invalidatePlan()
                  }}
                  style={
                    {
                      width: 110,
                      '--fill': `${Math.round(((opts.pages - 5) / 35) * 100)}%`,
                    } as React.CSSProperties
                  }
                />
                <span
                  className="w-[52px] text-right text-[12.5px] text-soft"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  ~{opts.pages} стр.
                </span>
              </div>
            </div>
            {TOGGLES.map((t) => (
              <div
                key={t.key}
                className="flex items-center justify-between gap-4 border-t border-line py-[13px]"
              >
                <div className="text-[13.5px] font-medium">{t.label}</div>
                <Toggle
                  on={opts[t.key] as boolean}
                  onToggle={() => {
                    setOpts((o) => ({ ...o, [t.key]: !o[t.key] }))
                    invalidatePlan()
                  }}
                />
              </div>
            ))}
          </div>

          {/* -------- справа: план работы (AI-12) -------- */}
          <div className="flex min-h-0 flex-col py-6 pl-7 md:pl-11">
            <div className="flex flex-shrink-0 items-baseline gap-2.5 border-b border-line pb-3.5">
              <h2 className="m-0 font-serif text-2xl font-normal" style={{ letterSpacing: '-.02em' }}>
                План работы
              </h2>
              {plan && (
                <span className="text-xs text-muted">
                  {plan.length} разделов · ~{opts.pages} стр.
                </span>
              )}
            </div>

            {plan ? (
              <div className="-mx-1.5 min-h-0 flex-1 overflow-y-auto px-1.5">
                <div className="flex flex-col">
                  {plan.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3.5 px-1 py-4"
                      style={{ borderTop: i === 0 ? '1px solid transparent' : '1px solid var(--line)' }}
                    >
                      <div className="min-w-0 flex-1">
                        <input
                          value={s.title}
                          onChange={(e) => editSection(i, { title: e.target.value })}
                          placeholder="Название раздела"
                          className="w-full border-none bg-transparent p-0 text-sm font-semibold text-ink outline-none"
                        />
                        <input
                          value={s.desc}
                          onChange={(e) => editSection(i, { desc: e.target.value })}
                          placeholder="Краткое описание раздела…"
                          className="mt-1 w-full border-none bg-transparent p-0 text-[12.5px] leading-normal text-muted outline-none"
                        />
                      </div>
                      <button
                        onClick={() => setPlan((p) => p && p.filter((_, j) => j !== i))}
                        title="Удалить раздел"
                        className="flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center rounded-[7px] border-none bg-transparent text-muted transition-colors hover:bg-hover hover:text-ink"
                      >
                        <CloseIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() =>
                    setPlan((p) => p && [...p, { title: 'Новый раздел', desc: '', subsections: [] }])
                  }
                  className="my-4 flex cursor-pointer items-center gap-[7px] border-none bg-transparent p-0 text-[12.5px] font-semibold text-accent hover:text-accent-dark"
                >
                  <PlusIcon size={14} strokeWidth={2.2} />
                  Добавить раздел
                </button>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 p-5 text-center">
                <span
                  className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] text-muted"
                  style={{ background: 'color-mix(in srgb, var(--hover) 55%, var(--surface))' }}
                >
                  <ListIcon />
                </span>
                <div className="max-w-[280px]">
                  <div className="font-serif text-xl font-medium text-ink">План ещё не построен</div>
                  <p className="mb-0 mt-1.5 text-[13px] leading-normal text-muted">
                    Опишите тему и задайте настройки слева, затем нажмите «Создать план» — агент
                    предложит структуру.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-shrink-0 flex-wrap items-center justify-center gap-2.5 border-t border-line pb-6 pt-3.5">
              {plan ? (
                <PlanCta
                  onClick={() => void start()}
                  busy={starting}
                  icon={<SparklesIcon size={16} />}
                  label={starting ? 'Запускаем…' : 'Сгенерировать работу'}
                />
              ) : (
                <PlanCta
                  onClick={() => void buildPlan()}
                  busy={planning}
                  icon={<ListPlusIcon size={16} />}
                  label={planning ? 'Строим план…' : 'Создать план'}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
