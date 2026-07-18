import { useEffect, useRef, useState } from 'react'
import { aiApi, AiJob, AiQuality } from '../api'
import { applyPromptAnalysis, buildGenerateOptions } from '../lib/aiPrompt'
import { SAMPLE_MD } from '../lib/sample'
import {
  ArrowUpIcon,
  ChevronDownIcon,
  GearIcon,
  PaperclipIcon,
  SparklesIcon,
  Spinner,
  StopIcon,
} from './icons'
import { SettingRow, Toggle } from './ui'

export type AiJobKind = 'generate' | 'edit'

interface AiConsoleProps {
  currentMd: string
  job: AiJob | null
  /** Проверка входа (генерация и правки требуют аккаунта). */
  onEnsureAuth: () => boolean
  onStarted: (jobId: string, successMsg: string, kind: AiJobKind) => void
  onCancel: () => void
  onToast: (msg: string) => void
}

const TIERS: { id: AiQuality; label: string; hint: string }[] = [
  { id: 'fast', label: 'Быстро', hint: '~2–4 мин' },
  { id: 'balanced', label: 'Баланс', hint: '~4–7 мин' },
  { id: 'quality', label: 'Качество', hint: '~6–12 мин' },
]

const COLLAPSE_KEY = 'md2docx:aiConsoleCollapsed'

type Mode = 'new' | 'edit'

/** Проверка промпта ДО отправки: пустышки и мусор не уходят на бэкенд (AI-9). */
export function validatePrompt(text: string, mode: Mode, docEmpty: boolean): string | null {
  const t = text.trim()
  if (mode === 'edit' && docEmpty) {
    return 'Документ пуст — исправлять нечего. Переключитесь на «Новый отчёт».'
  }
  if (t.length < 5) {
    return mode === 'new'
      ? 'Тема слишком короткая — сформулируйте её подробнее (минимум 5 символов).'
      : 'Опишите правку подробнее (минимум 5 символов).'
  }
  if (t.length > 4000) {
    return 'Промпт слишком длинный (до 4000 символов).'
  }
  if (!/[а-яёa-z]{3,}/i.test(t)) {
    return 'Промпт должен содержать осмысленный текст, а не только цифры и символы.'
  }
  return null
}

/**
 * ИИ-консоль под редактором: промпты меняют markdown без ручной правки.
 * Без рамки и без чата — весь вывод агента идёт ТОЛЬКО в редактор (md),
 * ошибки — тостами, статус задачи — строкой прогресса. Режим выбирается
 * явно: «Новый отчёт» (генерация по теме) / «Правка» (инструкция к текущему
 * документу — результат применяется сразу). Сворачивается кнопкой «Скрыть».
 */
export function AiConsole({
  currentMd,
  job,
  onEnsureAuth,
  onStarted,
  onCancel,
  onToast,
}: AiConsoleProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [prompt, setPrompt] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [optsOpen, setOptsOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Стартовая инструкция — не пользовательский текст: считаем документ пустым
  // (режим «Новый отчёт», генерация заменит её без confirm).
  const docEmpty = !currentMd.trim() || currentMd === SAMPLE_MD
  // Режим следует за документом (пустой → «Новый отчёт»), но переключается вручную.
  const [mode, setMode] = useState<Mode>(docEmpty ? 'new' : 'edit')
  useEffect(() => {
    setMode(docEmpty ? 'new' : 'edit')
  }, [docEmpty])

  // Настройки отчёта (то, что раньше жило в модалке генерации).
  const [pages, setPages] = useState(15)
  const [quality, setQuality] = useState<AiQuality>('balanced')
  const [bib, setBib] = useState(true)
  const [tables, setTables] = useState(true)
  const [diagrams, setDiagrams] = useState(true)
  const [formulas, setFormulas] = useState(false)
  const [images, setImages] = useState(false)
  const [webImages, setWebImages] = useState(false)
  const [codeAppendix, setCodeAppendix] = useState(false)

  const running = starting || job?.status === 'queued' || job?.status === 'running'
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!running) setStopping(false)
  }, [running])

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      return !c
    })
  }

  const send = async () => {
    if (running) return
    const text = prompt.trim()
    const problem = validatePrompt(text, mode, docEmpty)
    if (problem) {
      setError(problem)
      return
    }
    if (!onEnsureAuth()) return
    setStarting(true)
    setError(null)
    try {
      if (mode === 'new') {
        // Разбор промпта быстрой моделью: валидация по смыслу + извлечение
        // темы, требований и явно запрошенных элементов структуры. Тогглы в
        // ⚙ подстраиваются под промпт (null — не упомянуто, не трогаем).
        const a = await aiApi.analyzePrompt(text).catch(() => null)
        if (a && !a.ok) {
          setError(a.reason || 'Это не похоже на тему работы — сформулируйте, о чём должен быть отчёт.')
          setStarting(false)
          return
        }
        const { next, touched } = applyPromptAnalysis(a, {
          pages,
          bib,
          tables,
          diagrams,
          formulas,
          images,
          webImages,
          codeAppendix,
        })
        setPages(next.pages)
        setBib(next.bib)
        setTables(next.tables)
        setDiagrams(next.diagrams)
        setFormulas(next.formulas)
        setImages(next.images)
        setWebImages(next.webImages)
        setCodeAppendix(next.codeAppendix)
        if (touched) onToast('Настройки отчёта подстроены под промпт — проверить можно в ⚙')
        if (!docEmpty) {
          if (!window.confirm('Сгенерировать новый отчёт? Текущий текст будет заменён (откат — кнопкой в шапке).')) {
            setStarting(false)
            return
          }
        }
        const { jobId } = await aiApi.generate(buildGenerateOptions(a, text, quality, next), files)
        onStarted(jobId, 'Курсовая сгенерирована — текст в редакторе', 'generate')
      } else {
        // Правка всего документа: результат применяется в редактор сразу.
        const { jobId } = await aiApi.edit(text, currentMd)
        onStarted(jobId, 'Правка готова — текст обновлён', 'edit')
      }
      setPrompt('')
      setOptsOpen(false)
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Не удалось запустить задачу')
    } finally {
      setStarting(false)
    }
  }

  const stop = () => {
    setStopping(true)
    onCancel()
  }

  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        title="Развернуть ИИ-консоль"
        className="flex h-8 w-full flex-shrink-0 cursor-pointer items-center gap-2 border-t border-line bg-paper px-3.5 text-[11.5px] font-medium text-muted hover:text-ink"
      >
        <span style={{ color: 'var(--warm)' }}>
          {running ? <Spinner size={13} /> : <SparklesIcon size={13} />}
        </span>
        <span>
          {running && job
            ? `${job.stage} · ${Math.round(job.progress * 100)}%`
            : 'Спросить ИИ…'}
        </span>
        <div className="flex-1" />
        <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide">
          Развернуть
          <span className="rotate-180">
            <ChevronDownIcon size={12} />
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className="relative flex flex-shrink-0 flex-col border-t border-line bg-paper px-3 pb-2 pt-1.5">
      {/* Прогресс активной задачи (вывод агента — только в редакторе) */}
      {running && job && (
        <div className="flex items-center gap-2 px-0.5 pt-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-hover">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${Math.max(3, job.progress * 100)}%` }}
            />
          </div>
          <span className="text-[10.5px] text-soft" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {job.stage} · {Math.round(job.progress * 100)}%
          </span>
          <button
            onClick={stop}
            disabled={stopping}
            title="Остановить задачу (написанное останется)"
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted hover:bg-hover hover:text-ink disabled:opacity-50"
          >
            {stopping ? <Spinner size={11} /> : <StopIcon size={11} />}
          </button>
        </div>
      )}

      {/* Чипсы приложенных файлов */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-0.5 pt-1.5">
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
      )}

      {/* Поле ввода — без рамки, просто текст на подложке консоли */}
      <textarea
        value={prompt}
        disabled={running}
        onChange={(e) => {
          setPrompt(e.target.value)
          if (error) setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
          }
        }}
        rows={Math.min(6, Math.max(1, prompt.split('\n').length))}
        placeholder={
          mode === 'new'
            ? 'Тема работы — ИИ напишет курсовую целиком…'
            : 'Что изменить? ИИ перепишет документ…'
        }
        className="w-full resize-none border-none bg-transparent px-1 pb-0.5 pt-2 text-[12.5px] leading-[1.45] text-ink outline-none disabled:opacity-60"
      />

      {/* Ошибка валидации промпта */}
      {error && (
        <div className="px-1 pb-0.5 text-[11px] font-medium" style={{ color: '#c0392b' }}>
          {error}
        </div>
      )}

      {/* Тонкая линия отделяет поле ввода от ряда кнопок */}
      <div className="mb-1.5 mt-1 h-px flex-shrink-0" style={{ background: 'var(--line)' }} />

      {/* Нижний ряд: режим и файлы/настройки слева, скрыть/отправить справа */}
      <div className="flex items-center gap-0.5">
        <div className="mr-1 flex gap-0.5 rounded-lg bg-hover p-0.5">
          {(
            [
              ['new', 'Новый отчёт'],
              ['edit', 'Правка'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                if (!running) {
                  setMode(m)
                  setError(null)
                }
              }}
              disabled={running}
              title={
                m === 'new'
                  ? 'Сгенерировать курсовую с нуля по теме из поля'
                  : 'Исправить текущий документ по инструкции'
              }
              className="cursor-pointer rounded-[6px] border-none px-2 py-0.5 text-[10.5px] font-semibold transition-colors disabled:opacity-60"
              style={{
                background: mode === m ? 'var(--surface)' : 'transparent',
                color: mode === m ? 'var(--ink)' : 'var(--muted)',
                boxShadow: mode === m ? '0 1px 3px rgba(61,57,41,.12)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
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
          disabled={running}
          title="Прикрепить файлы-источники (PDF, DOCX, TXT, MD — до 5 шт.)"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          <PaperclipIcon size={14} />
        </button>
        <button
          onClick={() => setOptsOpen((v) => !v)}
          disabled={running}
          title="Настройки отчёта: качество, объём, структура"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-none text-muted hover:text-ink disabled:opacity-50"
          style={{ background: optsOpen ? 'var(--hover)' : 'transparent' }}
        >
          <GearIcon size={14} />
        </button>
        <div className="flex-1" />
        <button
          onClick={toggleCollapsed}
          title="Спрятать консоль вниз"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted hover:bg-hover hover:text-ink"
        >
          <ChevronDownIcon size={13} />
        </button>
        <button
          onClick={() => void send()}
          disabled={running}
          title={mode === 'new' ? 'Сгенерировать отчёт (Enter)' : 'Отправить правку (Enter)'}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-accent text-white transition-colors hover:bg-accent-dark disabled:opacity-40"
        >
          {running ? <Spinner size={13} /> : <ArrowUpIcon size={14} />}
        </button>
      </div>

      {/* Поповер настроек отчёта (открывается вверх) */}
      {optsOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOptsOpen(false)} />
          <div
            className="absolute bottom-full left-2 z-40 mb-1.5 flex flex-col overflow-y-auto bg-surface px-4 pb-3 pt-2"
            style={{
              width: 360,
              maxWidth: 'calc(100% - 16px)',
              maxHeight: 420,
              borderRadius: 14,
              boxShadow: '0 12px 40px rgba(61,57,41,.22), 0 0 0 1px var(--edge)',
            }}
          >
            <div className="pb-1 pt-1 text-[11px] font-bold uppercase tracking-[.08em] text-faint">
              Настройки отчёта
            </div>
            <div className="flex gap-1.5 pb-2 pt-1">
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
                  value={pages}
                  onChange={(e) => setPages(+e.target.value)}
                  style={{ width: 100, accentColor: '#d97757' }}
                />
                <span className="text-right text-[12px] text-soft" style={{ width: 46, fontVariantNumeric: 'tabular-nums' }}>
                  ~{pages} стр.
                </span>
              </div>
            </SettingRow>
            <SettingRow label="Список литературы" desc="Раздел источников по ГОСТ">
              <Toggle on={bib} onToggle={() => setBib(!bib)} />
            </SettingRow>
            <SettingRow label="Таблицы" desc="Сравнения и сводные данные">
              <Toggle on={tables} onToggle={() => setTables(!tables)} />
            </SettingRow>
            <SettingRow label="Mermaid-схемы" desc="Диаграммы архитектуры и процессов">
              <Toggle on={diagrams} onToggle={() => setDiagrams(!diagrams)} />
            </SettingRow>
            <SettingRow label="Формулы" desc="Выключные LaTeX-формулы с пояснениями">
              <Toggle on={formulas} onToggle={() => setFormulas(!formulas)} />
            </SettingRow>
            <SettingRow label="Приложение с кодом" desc="«Приложение А» с листингами">
              <Toggle on={codeAppendix} onToggle={() => setCodeAppendix(!codeAppendix)} />
            </SettingRow>
            <SettingRow label="Графики (строит ИИ)" desc="matplotlib-скрипты выполняет сервер">
              <Toggle on={images} onToggle={() => setImages(!images)} />
            </SettingRow>
            <SettingRow label="Картинки из интернета" desc="ИИ подберёт ссылки, сервер скачает">
              <Toggle on={webImages} onToggle={() => setWebImages(!webImages)} />
            </SettingRow>
          </div>
        </>
      )}
    </div>
  )
}
