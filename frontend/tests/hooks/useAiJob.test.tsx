/**
 * Поллинг ИИ-задачи (AI-4 остановка, AI-5 стриминг): фейковые таймеры +
 * замоканный aiApi.job. Результат генерации и правки применяется в редактор
 * СРАЗУ (без diff-просмотра и истории откатов); при отмене уже написанные
 * разделы остаются в редакторе.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiJob } from '../../src/api'
import { useAiJob } from '../../src/hooks/useAiJob'

vi.mock('../../src/api', () => ({
  aiApi: {
    job: vi.fn(),
    cancel: vi.fn(),
  },
}))

import { aiApi } from '../../src/api'

const mocked = vi.mocked(aiApi)

const JOB: AiJob = {
  id: 'j1',
  status: 'running',
  stage: 'Пишем разделы',
  progress: 0.5,
  markdown: null,
  error: null,
}

function setup() {
  const deps = {
    userTouched: { current: false },
    taRef: { current: null },
    setMd: vi.fn(),
    onMdChange: vi.fn(),
    schedulePaginate: vi.fn(),
    showToast: vi.fn(),
  }
  const hook = renderHook(() => useAiJob(deps))
  return { deps, hook }
}

/** Один тик поллинга (интервал 700 мс) + микротаски ответа. */
const tick = () => act(() => vi.advanceTimersByTimeAsync(700))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AI-5: стриминг генерации', () => {
  it('растущий partial пишется прямо в редактор с перепагинацией', async () => {
    const { deps, hook } = setup()
    act(() => hook.result.current.trackAiJob('j1', 'Готово', 'generate'))
    expect(hook.result.current.aiActive).toBe(true)
    expect(deps.userTouched.current).toBe(true)

    mocked.job.mockResolvedValueOnce({ ...JOB, partial: '# Введение\n\nЧанк 1' })
    await tick()
    expect(deps.setMd).toHaveBeenCalledWith('# Введение\n\nЧанк 1')
    expect(deps.schedulePaginate).toHaveBeenCalled()

    // Тот же partial повторно в редактор не пишется.
    mocked.job.mockResolvedValueOnce({ ...JOB, partial: '# Введение\n\nЧанк 1' })
    await tick()
    expect(deps.setMd).toHaveBeenCalledTimes(1)
  })

  it('done: финальный текст применяется сразу через onMdChange', async () => {
    const { deps, hook } = setup()
    act(() => hook.result.current.trackAiJob('j1', 'Курсовая сгенерирована', 'generate'))

    mocked.job.mockResolvedValueOnce({ ...JOB, partial: 'черновик' })
    await tick()
    mocked.job.mockResolvedValueOnce({ ...JOB, status: 'done', markdown: '# Финал' })
    await tick()

    expect(deps.onMdChange).toHaveBeenCalledWith('# Финал')
    expect(deps.showToast).toHaveBeenCalledWith('Курсовая сгенерирована')
    expect(hook.result.current.aiJob).toBeNull()
  })

  it('отмена ПОСЛЕ стриминга: partial фиксируется в редакторе', async () => {
    const { deps, hook } = setup()
    act(() => hook.result.current.trackAiJob('j1', 'Готово', 'generate'))

    mocked.job.mockResolvedValueOnce({ ...JOB, partial: '# Введение' })
    await tick()
    mocked.job.mockResolvedValueOnce({ ...JOB, status: 'cancelled', partial: '# Введение' })
    await tick()

    expect(deps.onMdChange).toHaveBeenCalledWith('# Введение')
    expect(deps.showToast).toHaveBeenCalledWith(
      'Генерация остановлена — написанные разделы оставлены в редакторе',
    )
  })

  it('отмена с partial без стриминга — разделы всё равно попадают в редактор', async () => {
    const { deps, hook } = setup()
    act(() => hook.result.current.trackAiJob('j1', 'Готово', 'generate'))

    mocked.job.mockResolvedValueOnce({ ...JOB, status: 'cancelled', partial: '# Раздел 1' })
    await tick()

    expect(deps.onMdChange).toHaveBeenCalledWith('# Раздел 1')
  })

  it('отмена без partial — только тост, текст не тронут', async () => {
    const { deps, hook } = setup()
    act(() => hook.result.current.trackAiJob('j1', 'Готово', 'generate'))
    mocked.job.mockResolvedValueOnce({ ...JOB, status: 'cancelled' })
    await tick()
    expect(deps.showToast).toHaveBeenCalledWith('Задача ИИ остановлена')
    expect(deps.onMdChange).not.toHaveBeenCalled()
  })

  it('ошибка задачи — тост с причиной', async () => {
    const { deps, hook } = setup()
    act(() => hook.result.current.trackAiJob('j1', 'Готово', 'generate'))
    mocked.job.mockResolvedValueOnce({ ...JOB, status: 'error', error: 'нет ключа' })
    await tick()
    expect(deps.showToast).toHaveBeenCalledWith('Ошибка ИИ: нет ключа')
  })
})

describe('AI-6: правка всего документа', () => {
  it('done+edit: результат применяется сразу через onMdChange (без стриминга)', async () => {
    const { deps, hook } = setup()
    act(() => hook.result.current.trackAiJob('j2', 'Правка готова', 'edit'))
    mocked.job.mockResolvedValueOnce({ ...JOB, status: 'done', markdown: '# Новый' })
    await tick()

    // Правка не стримит partial в редактор — применяется только финальный текст.
    expect(deps.setMd).not.toHaveBeenCalled()
    expect(deps.onMdChange).toHaveBeenCalledWith('# Новый')
    expect(deps.showToast).toHaveBeenCalledWith('Правка готова')
    expect(hook.result.current.aiJob).toBeNull()
  })
})

describe('AI-4: остановка задачи', () => {
  it('cancelAi дёргает aiApi.cancel с id активной задачи', async () => {
    const { hook } = setup()
    act(() => hook.result.current.trackAiJob('j9', 'Готово', 'generate'))
    mocked.cancel.mockResolvedValueOnce({ status: 'cancelled' })
    await act(async () => hook.result.current.cancelAi())
    expect(mocked.cancel).toHaveBeenCalledWith('j9')
  })

  it('после завершения задачи cancelAi ничего не дёргает', async () => {
    const { hook } = setup()
    act(() => hook.result.current.trackAiJob('j9', 'Готово', 'generate'))
    mocked.job.mockResolvedValueOnce({ ...JOB, status: 'done', markdown: '# х' })
    await tick()
    await act(async () => hook.result.current.cancelAi())
    expect(mocked.cancel).not.toHaveBeenCalled()
  })
})
