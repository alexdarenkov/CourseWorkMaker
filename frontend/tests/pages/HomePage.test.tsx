/**
 * Главная-launcher (AI-10, дизайн v2): две CTA («Создать с ИИ» → /create,
 * «В редактор» → /editor без confirm и без изменения черновика), кнопка
 * «Продолжить работу» при непустом черновике. Роутер — MemoryRouter,
 * useAuth замокан.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../../src/pages/HomePage'
import { consumeHomeAction } from '../../src/lib/handoff'
import { SAMPLE_MD } from '../../src/lib/sample'
import { loadPersisted, savePersisted } from '../../src/lib/storage'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'

const mockUser = vi.hoisted(() => ({ current: null as null | { id: string; name: string; email: string } }))

vi.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser.current }),
}))

function setup() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor" element={<div>ЭКРАН РЕДАКТОРА</div>} />
        <Route path="/create" element={<div>ЭКРАН СОЗДАНИЯ</div>} />
        <Route path="/login" element={<div>ЭКРАН ВХОДА</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  mockUser.current = null
  consumeHomeAction() // очистить «карман» между тестами
})

describe('CTA и черновик', () => {
  it('свежее хранилище (SAMPLE_MD) → кнопки «Продолжить» нет', () => {
    savePersisted({ md: SAMPLE_MD, s: DEFAULT_SETTINGS })
    setup()
    // «Создать с ИИ» есть и в хедере, и в hero.
    expect(screen.getAllByText('Создать с ИИ').length).toBeGreaterThan(0)
    expect(screen.getByText('В редактор')).toBeInTheDocument()
    expect(screen.queryByText(/Продолжить работу/)).toBeNull()
  })

  it('черновик в хранилище → «Продолжить» с первым заголовком, клик ведёт в редактор', () => {
    savePersisted({ md: '# Фильтр Калмана\n\nТекст.', s: DEFAULT_SETTINGS })
    setup()
    expect(screen.getByText(/«Фильтр Калмана»/)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Продолжить работу/))
    expect(screen.getByText('ЭКРАН РЕДАКТОРА')).toBeInTheDocument()
  })
})

describe('«Создать с ИИ» ведёт на страницу /create', () => {
  it('клик → страница создания (гейт входа — на самой странице)', () => {
    setup()
    fireEvent.click(screen.getAllByText('Создать с ИИ')[0])
    expect(screen.getByText('ЭКРАН СОЗДАНИЯ')).toBeInTheDocument()
    expect(consumeHomeAction()).toBeNull()
  })
})

describe('«В редактор»', () => {
  it('открывает редактор без confirm и не трогает черновик', () => {
    savePersisted({ md: '# Черновик', s: DEFAULT_SETTINGS })
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    setup()
    fireEvent.click(screen.getByText('В редактор'))
    expect(confirmMock).not.toHaveBeenCalled()
    expect(screen.getByText('ЭКРАН РЕДАКТОРА')).toBeInTheDocument()
    expect(loadPersisted().md).toBe('# Черновик')
    vi.unstubAllGlobals()
  })
})
