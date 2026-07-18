/**
 * Фоновая задача ИИ (AI-4/5, docs/specs/ai-agent.md): поллинг job 700 мс и
 * живой стриминг partial прямо в редактор. Результат генерации и правки
 * применяется к документу СРАЗУ — без diff-просмотра и истории откатов.
 */
import { RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { aiApi, AiJob } from '../api'
import type { AiJobKind } from '../components/AiConsole'
import { importAssets } from '../lib/assets'

interface UseAiJobDeps {
  userTouched: { current: boolean }
  taRef: RefObject<HTMLTextAreaElement>
  setMd: (v: string) => void
  onMdChange: (v: string) => void
  schedulePaginate: () => void
  showToast: (msg: string) => void
}

export function useAiJob({
  userTouched,
  taRef,
  setMd,
  onMdChange,
  schedulePaginate,
  showToast,
}: UseAiJobDeps) {
  const [aiJob, setAiJob] = useState<AiJob | null>(null)

  const aiPollRef = useRef<number | null>(null)
  const aiJobIdRef = useRef<string | null>(null)
  const aiActive = aiJob?.status === 'queued' || aiJob?.status === 'running'

  const stopAiPolling = useCallback(() => {
    if (aiPollRef.current) window.clearInterval(aiPollRef.current)
    aiPollRef.current = null
  }, [])

  useEffect(() => stopAiPolling, [stopAiPolling])

  // Предупреждение браузера при закрытии вкладки, пока идёт задача ИИ.
  useEffect(() => {
    if (!aiActive) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [aiActive])

  const trackAiJob = useCallback(
    (jobId: string, successMsg: string, kind: AiJobKind) => {
      userTouched.current = true
      stopAiPolling()
      aiJobIdRef.current = jobId
      let lastPartial = ''
      setAiJob({ id: jobId, status: 'queued', stage: 'В очереди', progress: 0, markdown: null, error: null })
      aiPollRef.current = window.setInterval(async () => {
        try {
          const j = await aiApi.job(jobId)
          setAiJob(j)
          // Живой стриминг генерации: растущий partial (готовые разделы +
          // «печатающийся» черновик текущего) показывается прямо в редакторе
          // и превью; по завершении заменится финальной версией.
          if (
            kind === 'generate' &&
            (j.status === 'running' || j.status === 'queued') &&
            j.partial &&
            j.partial !== lastPartial
          ) {
            lastPartial = j.partial
            setMd(j.partial)
            schedulePaginate()
            // Автопрокрутка редактора к «печатающейся» строке.
            const ta = taRef.current
            if (ta) requestAnimationFrame(() => (ta.scrollTop = ta.scrollHeight))
          }
          if (j.status === 'done' || j.status === 'error' || j.status === 'cancelled') {
            stopAiPolling()
            aiJobIdRef.current = null
            if (j.status === 'done' && j.markdown) {
              // Сначала кладём сгенерированные графики в хранилище, потом текст,
              // чтобы превью сразу нашло картинки asset:fig-N.
              importAssets(j.assets)
              onMdChange(j.markdown)
              showToast(successMsg)
              setAiJob(null)
            } else if (j.status === 'cancelled') {
              if (kind === 'generate' && j.partial?.trim()) {
                // Уже написанные разделы не пропадают — оставляем их в редакторе.
                onMdChange(j.partial)
                showToast('Генерация остановлена — написанные разделы оставлены в редакторе')
              } else {
                showToast('Задача ИИ остановлена')
              }
              setAiJob(null)
            } else if (j.status === 'error') {
              showToast('Ошибка ИИ: ' + (j.error ?? 'неизвестная'))
            }
          }
        } catch {
          /* временная ошибка опроса — продолжаем */
        }
      }, 700)
    },
    [onMdChange, schedulePaginate, setMd, showToast, stopAiPolling, taRef, userTouched],
  )

  const cancelAi = useCallback(async () => {
    const id = aiJobIdRef.current
    if (!id) return
    try {
      await aiApi.cancel(id)
    } catch {
      /* задача могла уже завершиться */
    }
  }, [])

  return {
    aiJob,
    aiActive,
    trackAiJob,
    cancelAi,
  }
}
