import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  Button,
  ModalShell,
  Toggle,
} from '../../src/components/ui'

describe('Доступность общих компонентов', () => {
  it('кнопка по умолчанию не отправляет форму, busy блокирует действие', () => {
    const click = vi.fn()
    render(
      <Button busy onClick={click}>
        Сохранить
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(button)
    expect(click).not.toHaveBeenCalled()
  })
  it('переключатель имеет имя и сообщает своё состояние', () => {
    render(<Toggle label="Номера страниц" on onToggle={() => {}} />)
    expect(
      screen.getByRole('switch', { name: 'Номера страниц' }),
    ).toHaveAttribute('aria-checked', 'true')
  })
  it('модальное окно удерживает Tab, закрывается по Escape и возвращает фокус', () => {
    const close = vi.fn()
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const { unmount } = render(
      <ModalShell
        label="Настройки"
        width={400}
        maxHeight="80vh"
        onClose={close}
      >
        <Button>Первый</Button>
        <Button>Последний</Button>
      </ModalShell>,
    )
    expect(screen.getByRole('dialog', { name: 'Настройки' })).toHaveAttribute(
      'aria-modal',
      'true',
    )
    // Фокус — на самом окне, без кольца на первой кнопке; Tab ведёт к ней.
    expect(screen.getByRole('dialog')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByText('Первый')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(screen.getByText('Последний')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByText('Первый')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
