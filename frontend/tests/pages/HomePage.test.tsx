/**
 * Главная-launcher (AI-10): три действия, карточка «Продолжить» при черновике,
 * гейт входа для «Создать с ИИ», очистка хранилища для «Пустой документ».
 * Роутер — MemoryRouter, useAuth замокан.
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

describe('три действия и черновик', () => {
  it('свежее хранилище (SAMPLE_MD) → карточки «Продолжить» нет', () => {
    setup()
    expect(screen.getByText('Создать с ИИ')).toBeInTheDocument()
    expect(screen.getByText('Пустой документ')).toBeInTheDocument()
    expect(screen.getByText('Загрузить .md / .zip')).toBeInTheDocument()
    expect(screen.queryByText(/Продолжить работу/)).toBeNull()
  })

  it('черновик в хранилище → «Продолжить» с первым заголовком, клик ведёт в редактор', () => {
    savePersisted({ md: '# Фильтр Калмана\n\nТекст.', s: DEFAULT_SETTINGS })
    setup()
    fireEvent.click(screen.getByText(/Продолжить работу/))
    expect(screen.getByText('ЭКРАН РЕДАКТОРА')).toBeInTheDocument()
  })
})

describe('«Создать с ИИ» ведёт на страницу /create', () => {
  it('клик по карточке → страница создания (гейт входа — на самой странице)', () => {
    setup()
    fireEvent.click(screen.getByText('Создать с ИИ'))
    expect(screen.getByText('ЭКРАН СОЗДАНИЯ')).toBeInTheDocument()
    expect(consumeHomeAction()).toBeNull()
  })
})

describe('«Пустой документ»', () => {
  it('без черновика → хранилище очищается, редактор открывается без confirm', () => {
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    setup()
    fireEvent.click(screen.getByText('Пустой документ'))
    expect(confirmMock).not.toHaveBeenCalled()
    expect(screen.getByText('ЭКРАН РЕДАКТОРА')).toBeInTheDocument()
    expect(loadPersisted().md).toBe('')
    vi.unstubAllGlobals()
  })

  it('с черновиком → confirm; отказ ничего не меняет', () => {
    savePersisted({ md: '# Черновик', s: DEFAULT_SETTINGS })
    vi.stubGlobal('confirm', vi.fn(() => false))
    setup()
    fireEvent.click(screen.getByText('Пустой документ'))
    expect(screen.queryByText('ЭКРАН РЕДАКТОРА')).toBeNull()
    expect(loadPersisted().md).toBe('# Черновик')
    vi.unstubAllGlobals()
  })

  it('SAMPLE_MD не считается черновиком — заменяется без confirm', () => {
    savePersisted({ md: SAMPLE_MD, s: DEFAULT_SETTINGS })
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    setup()
    fireEvent.click(screen.getByText('Пустой документ'))
    expect(confirmMock).not.toHaveBeenCalled()
    expect(loadPersisted().md).toBe('')
    vi.unstubAllGlobals()
  })
})
