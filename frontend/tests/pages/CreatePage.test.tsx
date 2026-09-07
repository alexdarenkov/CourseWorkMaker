/**
 * Страница «Создать с ИИ» /create (AI-9, AI-10, AI-12, SEC-6): гейт входа,
 * локальная валидация темы, разбор analyze-prompt (fail-open), подстройка
 * тогглов, панель плана («Создать план» → правка → «Сгенерировать работу»
 * с полем plan), confirm при непустом черновике, запуск → handoff «track».
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreatePage } from '../../src/pages/CreatePage'
import { consumeHomeAction } from '../../src/lib/handoff'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'
import { savePersisted } from '../../src/lib/storage'

vi.mock('../../src/api', () => ({
  aiApi: {
    analyzePrompt: vi.fn(),
    plan: vi.fn(),
    generate: vi.fn(),
  },
  authApi: {},
}))

const mockAuth = vi.hoisted(() => ({
  current: { user: { id: 'u1', name: 'Аня', email: 'a@b.ru' } as { id: string; name: string; email: string } | null, loading: false },
}))

vi.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth.current,
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

const PLAN = {
  sections: [
    { title: 'Введение', desc: 'Цель и задачи', subsections: [] },
    { title: 'Обзор литературы', desc: 'Анализ подходов', subsections: ['Методы'] },
    { title: 'Заключение', desc: '', subsections: [] },
  ],
}

function setup() {
  return render(
    <MemoryRouter initialEntries={['/create']}>
      <Routes>
        <Route path="/create" element={<CreatePage />} />
        <Route path="/editor" element={<div>ЭКРАН РЕДАКТОРА</div>} />
        <Route path="/login" element={<div>ЭКРАН ВХОДА</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const topicField = () => screen.getByPlaceholderText('Название работы') as HTMLTextAreaElement

/** Заполняет тему и жмёт «Создать план» (AI-12, первый шаг). */
function buildPlan(text: string) {
  fireEvent.change(topicField(), { target: { value: text } })
  fireEvent.click(screen.getByText('Создать план'))
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockAuth.current = { user: { id: 'u1', name: 'Аня', email: 'a@b.ru' }, loading: false }
  consumeHomeAction()
})

describe('гейт входа', () => {
  it('гость → редирект на страницу входа', () => {
    mockAuth.current = { user: null, loading: false }
    setup()
    expect(screen.getByText('ЭКРАН ВХОДА')).toBeInTheDocument()
  })
})

describe('AI-9 ступень 1: локальная валидация темы', () => {
  it('короткая тема → инлайн-ошибка, запросы не уходят', async () => {
    setup()
    buildPlan('аб')
    expect(await screen.findByText(/Тема слишком короткая/)).toBeInTheDocument()
    expect(mocked.analyzePrompt).not.toHaveBeenCalled()
    expect(mocked.plan).not.toHaveBeenCalled()
  })
})

describe('AI-9 ступень 2 + AI-12: разбор промпта и построение плана', () => {
  it('ok:false → причина инлайн, план не строится', async () => {
    mocked.analyzePrompt.mockResolvedValue({ ...ANALYZE_OK, ok: false, reason: 'Это не тема' })
    setup()
    buildPlan('фывафыва фывафыва')
    expect(await screen.findByText('Это не тема')).toBeInTheDocument()
    expect(mocked.plan).not.toHaveBeenCalled()
  })

  it('SEC-6 fail-open: сбой analyze не блокирует построение плана', async () => {
    mocked.analyzePrompt.mockRejectedValue(new Error('сеть упала'))
    mocked.plan.mockResolvedValue(PLAN)
    setup()
    buildPlan('Разработка информационной системы')
    // План построен: разделы стали редактируемыми полями.
    expect(await screen.findByDisplayValue('Обзор литературы')).toBeInTheDocument()
    expect(mocked.plan).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Разработка информационной системы' }),
    )
  })

  it('извлечённые поля подстраивают опции плана (target_pages из разбора)', async () => {
    mocked.analyzePrompt.mockResolvedValue({
      ...ANALYZE_OK,
      topic: 'Фильтр Калмана',
      targetPages: 25,
      includeWebImages: true, // даже если промпт просил — UI их не даёт
    })
    mocked.plan.mockResolvedValue(PLAN)
    setup()
    buildPlan('Фильтр Калмана, 25 страниц')
    await waitFor(() => expect(mocked.plan).toHaveBeenCalled())
    expect(mocked.plan).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Фильтр Калмана', target_pages: 25 }),
    )
  })
})

describe('AI-12: генерация по утверждённому плану', () => {
  it('правка раздела попадает в plan options; запуск → handoff track + редактор', async () => {
    mocked.analyzePrompt.mockResolvedValue({ ...ANALYZE_OK, topic: 'Фильтр Калмана' })
    mocked.plan.mockResolvedValue(PLAN)
    mocked.generate.mockResolvedValue({ jobId: 'j1' })
    setup()
    buildPlan('Фильтр Калмана')
    const section = await screen.findByDisplayValue('Обзор литературы')
    fireEvent.change(section, { target: { value: 'Обзор методов фильтрации' } })
    fireEvent.click(screen.getByText('Сгенерировать работу'))
    await waitFor(() => expect(screen.getByText('ЭКРАН РЕДАКТОРА')).toBeInTheDocument())
    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'Фильтр Калмана',
        // Картинки из интернета убраны из UI — всегда false.
        include_web_images: false,
        plan: expect.arrayContaining([
          expect.objectContaining({ title: 'Обзор методов фильтрации' }),
        ]),
      }),
      [],
    )
    expect(consumeHomeAction()).toEqual({ kind: 'track', jobId: 'j1', topic: 'Фильтр Калмана' })
  })

  it('изменение параметров слева сбрасывает план', async () => {
    mocked.analyzePrompt.mockResolvedValue(ANALYZE_OK)
    mocked.plan.mockResolvedValue(PLAN)
    setup()
    buildPlan('Разработка информационной системы')
    await screen.findByDisplayValue('Обзор литературы')
    fireEvent.change(topicField(), { target: { value: 'Другая тема работы' } })
    expect(screen.queryByDisplayValue('Обзор литературы')).toBeNull()
    expect(screen.getByText('План ещё не построен')).toBeInTheDocument()
  })
})

describe('AI-10: замена непустого черновика', () => {
  it('черновик в localStorage → confirm; отказ — генерация не стартует', async () => {
    savePersisted({ md: '# Черновик', s: DEFAULT_SETTINGS })
    mocked.analyzePrompt.mockResolvedValue(ANALYZE_OK)
    mocked.plan.mockResolvedValue(PLAN)
    const confirmMock = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmMock)
    setup()
    buildPlan('Разработка информационной системы')
    fireEvent.click(await screen.findByText('Сгенерировать работу'))
    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(mocked.generate).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
