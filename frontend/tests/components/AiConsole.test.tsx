/**
 * ИИ-консоль (AI-9, AI-10, SEC-6, docs/specs/ai-agent.md, security.md):
 * локальная валидация промпта, разбор промпта analyze-prompt (fail-open),
 * автосинк режима с пустотой документа, запуск generate/edit.
 * Сетевые вызовы замоканы — тестируется только поведение консоли.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_MD } from '../../src/lib/sample'
import { AiConsole } from '../../src/components/AiConsole'

vi.mock('../../src/api', () => ({
  aiApi: {
    analyzePrompt: vi.fn(),
    generate: vi.fn(),
    edit: vi.fn(),
  },
}))

import { aiApi } from '../../src/api'

const mocked = vi.mocked(aiApi)

/** Разбор промпта «ничего не упомянуто»: все extract-поля null. */
const ANALYZE_OK = {
  ok: true,
  reason: null,
  topic: '',
  requirements: '',
  targetPages: null,
  includeTables: null,
  includeDiagrams: null,
  includeFormulas: null,
  includeImages: null,
  includeWebImages: null,
  includeCodeAppendix: null,
  includeBibliography: null,
}

function setup(overrides: Partial<Parameters<typeof AiConsole>[0]> = {}) {
  const props = {
    currentMd: SAMPLE_MD,
    job: null,
    onEnsureAuth: vi.fn(() => true),
    onStarted: vi.fn(),
    onCancel: vi.fn(),
    onToast: vi.fn(),
    ...overrides,
  }
  const utils = render(<AiConsole {...props} />)
  return { props, ...utils }
}

const promptField = () => screen.getByRole('textbox') as HTMLTextAreaElement

function send(text: string) {
  fireEvent.change(promptField(), { target: { value: text } })
  fireEvent.keyDown(promptField(), { key: 'Enter' })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AI-10: автосинк режима с пустотой документа', () => {
  it('стартовая инструкция (SAMPLE_MD) считается пустым документом → режим «Новый отчёт»', () => {
    setup({ currentMd: SAMPLE_MD })
    expect(promptField().placeholder).toContain('Тема работы')
  })

  it('непустой документ → режим «Правка»', () => {
    setup({ currentMd: '# Мой отчёт\n\nТекст.' })
    expect(promptField().placeholder).toContain('Что изменить?')
  })

  it('режим следует за документом при его изменении', () => {
    const { props, rerender } = setup({ currentMd: SAMPLE_MD })
    rerender(<AiConsole {...props} currentMd="# Появился текст" />)
    expect(promptField().placeholder).toContain('Что изменить?')
  })
})

describe('AI-9 ступень 1: локальная валидация (запрос не уходит на бэкенд)', () => {
  it('короткая тема (<5 символов) → инлайн-ошибка', async () => {
    setup()
    send('аб')
    expect(await screen.findByText(/Тема слишком короткая/)).toBeInTheDocument()
    expect(mocked.analyzePrompt).not.toHaveBeenCalled()
    expect(mocked.generate).not.toHaveBeenCalled()
  })

  it('промпт длиннее 4000 символов → инлайн-ошибка', async () => {
    setup()
    send('а'.repeat(4001))
    expect(await screen.findByText(/слишком длинный/)).toBeInTheDocument()
    expect(mocked.analyzePrompt).not.toHaveBeenCalled()
  })

  it('нет трёх букв подряд (цифры и символы) → инлайн-ошибка', async () => {
    setup()
    send('12345 !@#$ 678')
    expect(await screen.findByText(/осмысленный текст/)).toBeInTheDocument()
    expect(mocked.analyzePrompt).not.toHaveBeenCalled()
  })

  it('правка пустого документа → ошибка с подсказкой сменить режим', async () => {
    setup({ currentMd: SAMPLE_MD })
    fireEvent.click(screen.getByText('Правка'))
    send('исправь введение')
    expect(await screen.findByText(/Документ пуст/)).toBeInTheDocument()
    expect(mocked.edit).not.toHaveBeenCalled()
  })

  it('ошибка сбрасывается при правке текста промпта', async () => {
    setup()
    send('аб')
    await screen.findByText(/Тема слишком короткая/)
    fireEvent.change(promptField(), { target: { value: 'абв' } })
    expect(screen.queryByText(/Тема слишком короткая/)).toBeNull()
  })

  it('без входа (onEnsureAuth=false) задача не запускается', async () => {
    const { props } = setup({ onEnsureAuth: vi.fn(() => false) })
    send('Разработка информационной системы')
    await waitFor(() => expect(props.onEnsureAuth).toHaveBeenCalled())
    expect(mocked.analyzePrompt).not.toHaveBeenCalled()
  })
})

describe('AI-9 ступень 2: разбор промпта analyze-prompt', () => {
  it('ok:false → причина инлайн, генерация не запускается', async () => {
    mocked.analyzePrompt.mockResolvedValue({ ...ANALYZE_OK, ok: false, reason: 'Это не тема' })
    setup()
    send('фывафыва фывафыва')
    expect(await screen.findByText('Это не тема')).toBeInTheDocument()
    expect(mocked.generate).not.toHaveBeenCalled()
  })

  it('SEC-6 fail-open: сбой analyze-prompt не блокирует генерацию', async () => {
    mocked.analyzePrompt.mockRejectedValue(new Error('сеть упала'))
    mocked.generate.mockResolvedValue({ jobId: 'j1' })
    const { props } = setup()
    send('Разработка информационной системы')
    await waitFor(() =>
      expect(props.onStarted).toHaveBeenCalledWith('j1', 'Курсовая сгенерирована — текст в редакторе', 'generate'),
    )
    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Разработка информационной системы' }),
      [],
    )
  })

  it('извлечённые поля подстраивают настройки (null — не трогать) + тост', async () => {
    mocked.analyzePrompt.mockResolvedValue({
      ...ANALYZE_OK,
      topic: 'Фильтр Калмана',
      targetPages: 25,
      includeDiagrams: false,
    })
    mocked.generate.mockResolvedValue({ jobId: 'j2' })
    const { props } = setup()
    send('Фильтр Калмана, 25 страниц, без mermaid-схем')
    await waitFor(() => expect(mocked.generate).toHaveBeenCalled())
    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'Фильтр Калмана',
        target_pages: 25,
        include_diagrams: false,
        // Не упомянутые в промпте тогглы остаются дефолтными.
        include_tables: true,
        include_bibliography: true,
      }),
      [],
    )
    expect(props.onToast).toHaveBeenCalledWith(expect.stringContaining('подстроены под промпт'))
  })

  it('генерация при непустом документе требует confirm; отказ — задача не стартует', async () => {
    mocked.analyzePrompt.mockResolvedValue(ANALYZE_OK)
    // В happy-dom window.confirm отсутствует — подставляем мок целиком.
    const confirmMock = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmMock)
    setup({ currentMd: '# Уже есть текст' })
    fireEvent.click(screen.getByText('Новый отчёт'))
    send('Разработка информационной системы')
    await waitFor(() => expect(mocked.analyzePrompt).toHaveBeenCalled())
    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(mocked.generate).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('AI-6: режим «Правка»', () => {
  it('валидная инструкция → edit(инструкция, документ) без LLM-предпроверки', async () => {
    mocked.edit.mockResolvedValue({ jobId: 'j3' })
    const md = '# Отчёт\n\nВведение.'
    const { props } = setup({ currentMd: md })
    send('сделай введение подробнее')
    await waitFor(() =>
      expect(props.onStarted).toHaveBeenCalledWith('j3', 'Правка готова — текст обновлён', 'edit'),
    )
    expect(mocked.edit).toHaveBeenCalledWith('сделай введение подробнее', md)
  })
})

describe('AI-10: сворачивание консоли', () => {
  it('кнопка «Спрятать» сворачивает и пишет флаг в localStorage', () => {
    setup()
    fireEvent.click(screen.getByTitle('Спрятать консоль вниз'))
    expect(localStorage.getItem('md2docx:aiConsoleCollapsed')).toBe('1')
    expect(screen.getByText('Развернуть')).toBeInTheDocument()
  })

  it('флаг в localStorage → консоль стартует свёрнутой', () => {
    localStorage.setItem('md2docx:aiConsoleCollapsed', '1')
    setup()
    expect(screen.getByText('Спросить ИИ…')).toBeInTheDocument()
  })
})
