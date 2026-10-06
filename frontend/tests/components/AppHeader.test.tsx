import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { AppHeader } from '../../src/components/AppHeader'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'
import { loadEditorDraft, savePersisted } from '../../src/lib/storage'

it('смена темы на главной сохраняет несохранённый черновик после ошибки квоты', () => {
  savePersisted({ md: 'Старая копия', s: { ...DEFAULT_SETTINGS } })
  const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
  try {
    savePersisted({ md: 'Новая работа', s: { ...DEFAULT_SETTINGS, topic: 'Новая тема' } })
    render(<MemoryRouter><AppHeader /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Тёмная тема' }))
    expect(loadEditorDraft()).toMatchObject({ md: 'Новая работа', s: { topic: 'Новая тема', theme: 'dark' } })
  } finally {
    write.mockRestore()
    savePersisted(loadEditorDraft())
  }
})
