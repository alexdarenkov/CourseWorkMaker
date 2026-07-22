import { useEffect, useState } from 'react'
import { aiApi, AiJob } from '../api'
import { validatePrompt } from '../lib/aiPrompt'
import { SAMPLE_MD } from '../lib/sample'
import { ArrowUpIcon, ChevronDownIcon, SparklesIcon, Spinner, StopIcon } from './icons'

export type AiJobKind = 'generate' | 'edit'

interface AiConsoleProps {
  currentMd: string
  job: AiJob | null
  /** Пользователь вошёл: правка с ИИ доступна только залогиненным. */
  authed: boolean
  /** Проверка входа (страховка на отправке). */
  onEnsureAuth: () => boolean
  onStarted: (jobId: string, successMsg: string, kind: AiJobKind) => void
  onCancel: () => void
  onToast: (msg: string) => void
}

const COLLAPSE_KEY = 'md2docx:aiConsoleCollapsed'

/**
 * Консоль правок под редактором (AI-10): ТОЛЬКО изменение текущего документа
 * по инструкции (AI-6, результат применяется сразу). Генерация с нуля живёт на
 * странице /create (вход — навигация в шапке); при пустом документе консоль
 * показывает подсказку без кнопок. Без чата: вывод агента идёт только в
 * редактор, статус — строкой прогресса.
 */
export function AiConsole({
  currentMd,
  job,
  authed,
  onEnsureAuth,
  onStarted,
  onCancel,
  onToast,
}: AiConsoleProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [prompt, setPrompt] = useState('')
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Стартовая инструкция — не пользовательский текст: считаем документ пустым.
  const docEmpty = !currentMd.trim() || currentMd === SAMPLE_MD

  const running = starting || job?.status === 'queued' || job?.status === 'running'

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
    const problem = validatePrompt(text, 'edit', docEmpty)
    if (problem) {
      setError(problem)
      return
    }
    if (!onEnsureAuth()) return
    setStarting(true)
    setError(null)
    try {
      // Правка всего документа: результат применяется в редактор сразу (AI-6).
      const { jobId } = await aiApi.edit(text, currentMd)
      onStarted(jobId, 'Правка готова — текст обновлён', 'edit')
      setPrompt('')
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
      {/* Прогресс активной задачи (генерации из диалога — тоже здесь) */}
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

      {(!authed || docEmpty) && !running ? (
        // Гость или пустой документ: подсказка без кнопок — генерация и
        // загрузка запускаются только из навигации в шапке (AI-10).
        <div className="flex items-center gap-2.5 py-2">
          <span style={{ color: 'var(--warm)' }}>
            <SparklesIcon size={13} />
          </span>
          <span className="text-[11.5px] text-muted">
            {authed
              ? 'Правка с ИИ станет доступна, когда в документе появится текст — начните писать или создайте работу через «Создать с ИИ» в шапке'
              : 'Правка с ИИ доступна после входа в аккаунт'}
          </span>
          <div className="flex-1" />
          <button
            onClick={toggleCollapsed}
            title="Спрятать консоль вниз"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted hover:bg-hover hover:text-ink"
          >
            <ChevronDownIcon size={13} />
          </button>
        </div>
      ) : (
        <>
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
            placeholder="Что изменить? ИИ перепишет документ…"
            className="w-full resize-none border-none bg-transparent px-1 pb-0.5 pt-2 text-[12.5px] leading-[1.45] text-ink outline-none disabled:opacity-60"
          />
          {error && (
            <div className="px-1 pb-0.5 text-[11px] font-medium" style={{ color: '#c0392b' }}>
              {error}
            </div>
          )}
          <div className="mb-1.5 mt-1 h-px flex-shrink-0" style={{ background: 'var(--line)' }} />
          <div className="flex items-center gap-0.5">
            <span className="px-1 text-[10.5px] text-faint">
              Правка текущего документа · Enter — отправить
            </span>
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
              title="Отправить правку (Enter)"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-accent text-white transition-colors hover:bg-accent-dark disabled:opacity-40"
            >
              {running ? <Spinner size={13} /> : <ArrowUpIcon size={14} />}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
