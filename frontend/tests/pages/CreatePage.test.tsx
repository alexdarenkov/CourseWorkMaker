/**
 * Страница «Создать с ИИ» /create (AI-9, AI-10, SEC-6): гейт входа, локальная
 * валидация темы, разбор analyze-prompt (fail-open), подстройка тогглов,
 * confirm при непустом черновике, запуск → handoff «track» и переход в редактор.
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
    generate: vi.fn(),
  },
  // SiteHeader → UserModal импортирует authApi; в тестах он не вызывается.
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

const promptField = () => screen.getByRole('textbox') as HTMLTextAreaElement

function start(text: string) {
  fireEvent.change(promptField(), { target: { value: text } })
  fireEvent.click(screen.getByText('Сгенерировать'))
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
  it('короткая тема → инлайн-ошибка, запрос не уходит', async () => {
    setup()
    start('аб')
    expect(await screen.findByText(/Тема слишком короткая/)).toBeInTheDocument()
    expect(mocked.analyzePrompt).not.toHaveBeenCalled()
    expect(mocked.generate).not.toHaveBeenCalled()
  })
})

describe('AI-9 ступень 2: разбор промпта analyze-prompt', () => {
  it('ok:false → причина инлайн, генерация не запускается', async () => {
    mocked.analyzePrompt.mockResolvedValue({ ...ANALYZE_OK, ok: false, reason: 'Это не тема' })
    setup()
    start('фывафыва фывафыва')
    expect(await screen.findByText('Это не тема')).toBeInTheDocument()
    expect(mocked.generate).not.toHaveBeenCalled()
  })

  it('SEC-6 fail-open: сбой analyze не блокирует; запуск → handoff track + редактор', async () => {
    mocked.analyzePrompt.mockRejectedValue(new Error('сеть упала'))
    mocked.generate.mockResolvedValue({ jobId: 'j1' })
    setup()
    start('Разработка информационной системы')
    await waitFor(() => expect(screen.getByText('ЭКРАН РЕДАКТОРА')).toBeInTheDocument())
    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'Разработка информационной системы',
        // Картинки из интернета убраны из UI — всегда false.
        include_web_images: false,
      }),
      [],
    )
    expect(consumeHomeAction()).toEqual({
      kind: 'track',
      jobId: 'j1',
      topic: 'Разработка информационной системы',
    })
  })

  it('извлечённые поля подстраивают опции; web-картинки форсятся в false', async () => {
    mocked.analyzePrompt.mockResolvedValue({
      ...ANALYZE_OK,
      topic: 'Фильтр Калмана',
      targetPages: 25,
      includeDiagrams: false,
      includeWebImages: true, // даже если промпт просил — UI их не даёт
    })
    mocked.generate.mockResolvedValue({ jobId: 'j2' })
    setup()
    start('Фильтр Калмана, 25 страниц, с картинками из интернета')
    await waitFor(() => expect(mocked.generate).toHaveBeenCalled())
    expect(mocked.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'Фильтр Калмана',
        target_pages: 25,
        include_diagrams: false,
        include_web_images: false,
        include_tables: true,
      }),
      [],
    )
  })
})

describe('AI-10: замена непустого черновика', () => {
  it('черновик в localStorage → confirm; отказ — генерация не стартует', async () => {
    savePersisted({ md: '# Черновик', s: DEFAULT_SETTINGS })
    mocked.analyzePrompt.mockResolvedValue(ANALYZE_OK)
    const confirmMock = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmMock)
    setup()
    start('Разработка информационной системы')
    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(mocked.generate).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
