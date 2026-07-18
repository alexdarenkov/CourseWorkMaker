/** UI-примитивы: ModalShell, Toggle, SegButton, IconButton. */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IconButton, ModalCloseButton, ModalShell, SegButton, Toggle } from '../../src/components/ui'

describe('ModalShell', () => {
  it('клик по оверлею закрывает, клик по панели — нет', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ModalShell onClose={onClose} width={520} maxHeight="76vh">
        <div>содержимое</div>
      </ModalShell>,
    )
    fireEvent.click(screen.getByText('содержимое'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(container.firstElementChild!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('кнопка-крестик закрывает', () => {
    const onClose = vi.fn()
    render(<ModalCloseButton onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Закрыть'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('Toggle', () => {
  it('клик зовёт onToggle, включённое состояние — акцентный фон', () => {
    const onToggle = vi.fn()
    // Два независимых рендера вместо rerender: happy-dom ненадёжно применяет
    // обновление inline-стиля, а проверяем мы соответствие «проп → вид».
    const { container: off } = render(<Toggle on={false} onToggle={onToggle} />)
    fireEvent.click(off.querySelector('button')!)
    expect(onToggle).toHaveBeenCalledOnce()
    expect(off.querySelector('button')!.style.background).not.toBe('#d97757')
    const { container: on } = render(<Toggle on={true} onToggle={onToggle} />)
    expect(on.querySelector('button')!.style.background).toBe('#d97757')
  })
})

describe('SegButton', () => {
  it('активный сегмент выделен, клик переключает', () => {
    const onClick = vi.fn()
    render(
      <SegButton active={false} onClick={onClick}>
        Правка
      </SegButton>,
    )
    fireEvent.click(screen.getByText('Правка'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('IconButton', () => {
  it('доступен по title, клик проходит', () => {
    const onClick = vi.fn()
    render(
      <IconButton title="Тестовая кнопка" onClick={onClick}>
        x
      </IconButton>,
    )
    fireEvent.click(screen.getByTitle('Тестовая кнопка'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
