/**
 * Главная: кнопка «Редактор» → /editor без confirm и без изменения черновика,
 * миниатюры возможностей, отсутствие ИИ и «Продолжить работу».
 * Роутер — MemoryRouter.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../../src/pages/HomePage'
import { consumeHomeAction } from '../../src/lib/handoff'
import { SAMPLE_MD } from '../../src/lib/sample'
import { loadPersisted, savePersisted } from '../../src/lib/storage'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'

function setup() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor" element={<div>ЭКРАН РЕДАКТОРА</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  consumeHomeAction() // очистить «карман» между тестами
})

describe('CTA и возможности', () => {
  it('показывает переход в редактор и миниатюры возможностей из макета', () => {
    savePersisted({ md: SAMPLE_MD, s: DEFAULT_SETTINGS })
    setup()
    // В MVP нет генерации текста.
    expect(screen.queryByText('Создать с ИИ')).toBeNull()
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'Редактор' })).toBeInTheDocument()
    expect(screen.queryByText(/Продолжить работу/)).toBeNull()
    for (const label of ['Рисунки', 'Схемы', 'Таблицы', 'Формулы'])
      expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('«Редактор»', () => {
  it('открывает редактор без confirm и не трогает черновик', () => {
    savePersisted({ md: '# Черновик', s: DEFAULT_SETTINGS })
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    setup()
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Редактор' }))
    expect(confirmMock).not.toHaveBeenCalled()
    expect(screen.getByText('ЭКРАН РЕДАКТОРА')).toBeInTheDocument()
    expect(loadPersisted().md).toBe('# Черновик')
    vi.unstubAllGlobals()
  })
})
