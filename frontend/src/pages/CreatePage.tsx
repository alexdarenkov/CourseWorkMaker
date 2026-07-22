import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { aiApi, AiQuality } from '../api'
import { useAuth } from '../auth/AuthContext'
import { PaperclipIcon, SparklesIcon, Spinner } from '../components/icons'
import { SiteHeader } from '../components/SiteHeader'
import { SettingRow, Toggle } from '../components/ui'
import {
  applyPromptAnalysis,
  buildGenerateOptions,
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
const TOGGLES: { key: keyof ReportOptions; label: string; desc: string }[] = [
  { key: 'bib', label: 'Список литературы', desc: 'Раздел источников по ГОСТ' },
  { key: 'tables', label: 'Таблицы', desc: 'Сравнения и сводные данные' },
  { key: 'diagrams', label: 'Mermaid-схемы', desc: 'Диаграммы архитектуры и процессов' },
  { key: 'formulas', label: 'Формулы', desc: 'Выключные LaTeX-формулы с пояснениями' },
  { key: 'codeAppendix', label: 'Приложение с кодом', desc: '«Приложение А» с листингами' },
  { key: 'images', label: 'Графики (строит ИИ)', desc: 'matplotlib-скрипты выполняет сервер' },
]

/**
 * Страница «Создать с ИИ» (/create) — единственная точка запуска генерации
 * (AI-10). Тема и требования одним промптом (разбор analyze-prompt
 * подстраивает тогглы, AI-9); по запуску job передаётся редактору через
 * handoff, стриминг виден уже там.
 */
export function CreatePage() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [prompt, setPrompt] = useState('')
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
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Генерация требует аккаунта — гостя отправляем на вход.
  useEffect(() => {
    if (!loading && !user) navigate('/login')
  }, [loading, user, navigate])

  const start = async () => {
    if (starting) return
    const text = prompt.trim()
    const problem = validatePrompt(text, 'new', true)
    if (problem) {
      setError(problem)
      return
    }
    setStarting(true)
    setError(null)
    try {
      // Разбор промпта быстрой моделью: валидация по смыслу + извлечение темы
      // и явно запрошенных элементов структуры (fail-open при сбое, SEC-6).
      const a = await aiApi.analyzePrompt(text).catch(() => null)
      if (a && !a.ok) {
        setError(a.reason || 'Это не похоже на тему работы — сформулируйте, о чём должен быть отчёт.')
        setStarting(false)
        return
      }
      const { next } = applyPromptAnalysis(a, opts)
      const finalOpts = { ...next, webImages: false }
      setOpts(finalOpts)
      const persisted = loadPersisted()
      const docEmpty = !persisted.md.trim() || persisted.md === SAMPLE_MD
      if (!docEmpty) {
        if (!window.confirm('Сгенерировать новую работу? Текущий текст в редакторе будет заменён.')) {
          setStarting(false)
          return
        }
      }
      const { jobId } = await aiApi.generate(
        buildGenerateOptions(a, text, quality, finalOpts),
        files,
      )
      setHomeAction({ kind: 'track', jobId, topic: a?.topic || text.slice(0, 200) })
      navigate('/editor')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось запустить генерацию')
      setStarting(false)
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-paper text-ink antialiased"
      style={{
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif",
      }}
    >
      <SiteHeader
        left={
          <button
            onClick={() => navigate(-1)}
            className="ml-2 cursor-pointer rounded-full border-none bg-transparent px-3 py-1 text-[12.5px] font-semibold text-muted hover:bg-hover hover:text-ink"
          >
            ← Назад
          </button>
        }
      />

      <main className="mx-auto w-full max-w-[640px] flex-1 px-6 pb-16 pt-4">
        <div className="flex items-center gap-2.5">
          <span style={{ color: 'var(--warm)' }}>
            <SparklesIcon size={20} />
          </span>
          <h1 className="text-[24px] font-bold tracking-tight">Новая работа с ИИ</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Опишите тему и требования одним сообщением — агент составит план, напишет
          разделы и сам проверит результат. Текст появится в редакторе по мере генерации.
        </p>

        <textarea
          autoFocus
          value={prompt}
          disabled={starting}
          onChange={(e) => {
            setPrompt(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void start()
            }
          }}
          rows={5}
          placeholder="О чём работа? Тема, объём, требования методички — одним сообщением…"
          className="mt-4 w-full resize-y rounded-xl border border-edge bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none focus:border-accent disabled:opacity-60"
        />
        {error && (
          <div className="pt-1.5 text-[12px] font-medium" style={{ color: '#c0392b' }}>
            {error}
          </div>
        )}

        {/* Файлы-источники: содержимое подаётся агенту в контекст (AI-2). */}
        <div className="flex flex-wrap items-center gap-1.5 pt-3">
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
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-edge bg-transparent px-3 py-1 text-[11.5px] font-semibold text-soft hover:bg-hover disabled:opacity-50"
          >
            <PaperclipIcon size={13} />
            Файлы-источники
          </button>
          {files.map((f, i) => (
            <span
              key={i}
              className="flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-[10.5px] text-soft"
            >
              {f.name}
              <button
                onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))}
                className="cursor-pointer border-none bg-transparent p-0 font-bold text-muted hover:text-ink"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-1.5 pb-1 pt-4">
          {TIERS.map((t) => (
            <button
              key={t.id}
              onClick={() => setQuality(t.id)}
              className="flex flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-[10px] border px-2.5 py-1.5 text-left"
              style={{
                borderColor: quality === t.id ? '#d97757' : 'var(--edge)',
                background: quality === t.id ? 'var(--warm-bg)' : 'var(--paper)',
              }}
            >
              <span className="text-[12px] font-semibold text-ink">{t.label}</span>
              <span className="text-[10px] text-muted">{t.hint}</span>
            </button>
          ))}
        </div>

        <SettingRow label="Целевой объём" desc="Примерное число страниц основной части">
          <div className="flex flex-shrink-0 items-center gap-2">
            <input
              type="range"
              min={5}
              max={40}
              step={1}
              value={opts.pages}
              onChange={(e) => setOpts((o) => ({ ...o, pages: +e.target.value }))}
              style={{ width: 100, accentColor: '#d97757' }}
            />
            <span
              className="text-right text-[12px] text-soft"
              style={{ width: 46, fontVariantNumeric: 'tabular-nums' }}
            >
              ~{opts.pages} стр.
            </span>
          </div>
        </SettingRow>
        {TOGGLES.map((t) => (
          <SettingRow key={t.key} label={t.label} desc={t.desc}>
            <Toggle
              on={opts[t.key] as boolean}
              onToggle={() => setOpts((o) => ({ ...o, [t.key]: !o[t.key] }))}
            />
          </SettingRow>
        ))}

        <button
          onClick={() => void start()}
          disabled={starting}
          className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-accent py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
        >
          {starting ? <Spinner size={14} /> : <SparklesIcon size={14} />}
          {starting ? 'Запускаем…' : 'Сгенерировать'}
        </button>
      </main>
    </div>
  )
}
