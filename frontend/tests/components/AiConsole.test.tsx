/**
 * Консоль правок (AI-6, AI-10, docs/specs/ai-agent.md): при пустом документе —
 * CTA на диалог создания; при непустом — правка текущего текста, локальная
 * валидация инструкции (ступень 1 AI-9), запуск /edit без LLM-предпроверки.
 * Сетевые вызовы замоканы — тестируется только поведение консоли.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_MD } from '../../src/lib/sample'
import { AiConsole } from '../../src/components/AiConsole'

vi.mock('../../src/api', () => ({
  aiApi: {
    edit: vi.fn(),
  },
}))

import { aiApi } from '../../src/api'

const mocked = vi.mocked(aiApi)

function setup(overrides: Partial<Parameters<typeof AiConsole>[0]> = {}) {
  const props = {
    currentMd: '# Мой отчёт\n\nТекст.',
    job: null,
    authed: true,
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

describe('AI-10: пустой документ → подсказка без кнопок', () => {
  it('стартовая инструкция (SAMPLE_MD) считается пустым документом → подсказка вместо поля', () => {
    setup({ currentMd: SAMPLE_MD })
    expect(screen.getByText(/станет доступна, когда в документе появится текст/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    // Кнопок запуска генерации в консоли нет — только навигация в шапке.
    expect(screen.queryByRole('button', { name: /Создать/ })).toBeNull()
  })

  it('непустой документ → поле правки', () => {
    setup({ currentMd: '# Мой отчёт' })
    expect(promptField().placeholder).toContain('Что изменить?')
  })

  it('гость (authed=false) → подсказка входа даже при непустом документе', () => {
    setup({ currentMd: '# Мой отчёт', authed: false })
    expect(screen.getByText(/доступна после входа/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('AI-9 ступень 1: локальная валидация инструкции', () => {
  it('короткая инструкция (<5 символов) → инлайн-ошибка, запрос не уходит', async () => {
    setup()
    send('аб')
    expect(await screen.findByText(/Опишите правку подробнее/)).toBeInTheDocument()
    expect(mocked.edit).not.toHaveBeenCalled()
  })

  it('нет трёх букв подряд → инлайн-ошибка', async () => {
    setup()
    send('12345 !@#$ 678')
    expect(await screen.findByText(/осмысленный текст/)).toBeInTheDocument()
    expect(mocked.edit).not.toHaveBeenCalled()
  })

  it('ошибка сбрасывается при правке текста промпта', async () => {
    setup()
    send('аб')
    await screen.findByText(/Опишите правку подробнее/)
    fireEvent.change(promptField(), { target: { value: 'абв' } })
    expect(screen.queryByText(/Опишите правку подробнее/)).toBeNull()
  })

  it('без входа (onEnsureAuth=false) правка не запускается', async () => {
    const { props } = setup({ onEnsureAuth: vi.fn(() => false) })
    send('сделай введение подробнее')
    await waitFor(() => expect(props.onEnsureAuth).toHaveBeenCalled())
    expect(mocked.edit).not.toHaveBeenCalled()
  })
})

describe('AI-6: запуск правки', () => {
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

  it('ошибка запуска — тостом, onStarted не вызывается', async () => {
    mocked.edit.mockRejectedValue(new Error('Сервис недоступен'))
    const { props } = setup()
    send('сделай введение подробнее')
    await waitFor(() => expect(props.onToast).toHaveBeenCalledWith('Сервис недоступен'))
    expect(props.onStarted).not.toHaveBeenCalled()
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
