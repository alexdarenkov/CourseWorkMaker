/**
 * Редактор: хоткеи (Tab, Ctrl+S, Ctrl+B/I по e.code — работают в русской
 * раскладке), сниппеты тулбара, drag&drop файлов, нумерация строк.
 * Совпадение переносов textarea ↔ pre-слоя (overlay-инвариант) проверяется
 * тестом highlight.test.ts и харнессом highlight-test.html — не здесь.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, Settings } from '../../src/lib/settings'
import { EditorPane } from '../../src/components/EditorPane'

function setup(md = 'первая строка', settings: Partial<Settings> = {}) {
  const taRef = createRef<HTMLTextAreaElement>()
  const props = {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    width: '50%',
    taRef,
    onChange: vi.fn(),
    onSave: vi.fn(),
    onInsert: vi.fn(),
    onInsertImage: vi.fn(),
    onUploadMd: vi.fn(),
    onOpenSettings: vi.fn(),
    onToast: vi.fn(),
  }
  // Обёртка со state — как в EditorPage: onChange реально меняет md.
  function Host() {
    const [value, setValue] = useState(md)
    return (
      <EditorPane
        {...props}
        md={value}
        onChange={(v) => {
          setValue(v)
          props.onChange(v)
        }}
      />
    )
  }
  const utils = render(<Host />)
  const ta = taRef.current!
  return { props, ta, ...utils }
}

describe('хоткеи редактора', () => {
  it('Tab вставляет два пробела вместо смены фокуса', () => {
    const { props, ta } = setup('текст')
    ta.setSelectionRange(0, 0)
    fireEvent.keyDown(ta, { key: 'Tab' })
    expect(props.onChange).toHaveBeenCalledWith('  текст')
  })

  it('Ctrl+S (e.code=KeyS) вызывает сохранение', () => {
    const { props, ta } = setup()
    fireEvent.keyDown(ta, { code: 'KeyS', ctrlKey: true })
    expect(props.onSave).toHaveBeenCalledOnce()
  })

  it('Ctrl+B оборачивает выделение в **жирный**', () => {
    const { props, ta } = setup('жирный текст')
    ta.setSelectionRange(0, 6)
    fireEvent.keyDown(ta, { code: 'KeyB', ctrlKey: true })
    expect(props.onChange).toHaveBeenCalledWith('**жирный** текст')
  })

  it('Ctrl+I оборачивает выделение в *курсив*', () => {
    const { props, ta } = setup('курсив')
    ta.setSelectionRange(0, 6)
    fireEvent.keyDown(ta, { code: 'KeyI', ctrlKey: true })
    expect(props.onChange).toHaveBeenCalledWith('*курсив*')
  })

  it('Ctrl+Shift+B не срабатывает (только чистый Ctrl)', () => {
    const { props, ta } = setup('текст')
    fireEvent.keyDown(ta, { code: 'KeyB', ctrlKey: true, shiftKey: true })
    expect(props.onChange).not.toHaveBeenCalled()
  })
})

describe('тулбар', () => {
  it('кнопки вставляют сниппеты таблицы/кода/схемы/формулы', () => {
    const { props } = setup()
    fireEvent.click(screen.getByTitle('Вставить таблицу'))
    expect(props.onInsert).toHaveBeenLastCalledWith(expect.stringContaining('Таблица: Название таблицы'))
    fireEvent.click(screen.getByTitle('Вставить блок кода'))
    expect(props.onInsert).toHaveBeenLastCalledWith(expect.stringContaining('```python'))
    fireEvent.click(screen.getByTitle('Вставить схему (mermaid)'))
    expect(props.onInsert).toHaveBeenLastCalledWith(expect.stringContaining('```mermaid'))
    fireEvent.click(screen.getByTitle('Вставить формулу (LaTeX)'))
    expect(props.onInsert).toHaveBeenLastCalledWith(expect.stringContaining('$$'))
  })

  it('кнопки настроек и загрузки документа на месте', () => {
    const { props } = setup()
    fireEvent.click(screen.getByTitle('Настройки редактора'))
    expect(props.onOpenSettings).toHaveBeenCalledOnce()
    // Загрузка .md/.zip переехала из шапки в тулбар (AI-10, редизайн v2).
    expect(screen.getByTitle(/Загрузить \.md/)).toBeInTheDocument()
  })
})

describe('drag&drop файлов', () => {
  const drop = (container: HTMLElement, file: File) => {
    fireEvent.drop(container.querySelector('section')!, {
      dataTransfer: { files: [file], types: ['Files'] },
    })
  }

  it('картинка → вставка изображения', () => {
    const { props, container } = setup()
    const img = new File(['png'], 'схема.png', { type: 'image/png' })
    drop(container, img)
    expect(props.onInsertImage).toHaveBeenCalledWith(img)
  })

  it('.md и .zip → загрузка документа', () => {
    const { props, container } = setup()
    drop(container, new File(['# т'], 'отчёт.md', { type: 'text/markdown' }))
    expect(props.onUploadMd).toHaveBeenCalledOnce()
    drop(container, new File([''], 'архив.zip', { type: 'application/zip' }))
    expect(props.onUploadMd).toHaveBeenCalledTimes(2)
  })

  it('неподдерживаемый файл → тост', () => {
    const { props, container } = setup()
    drop(container, new File([''], 'прога.exe', { type: 'application/octet-stream' }))
    expect(props.onToast).toHaveBeenCalledWith('Поддерживаются изображения, .md и .zip')
    expect(props.onUploadMd).not.toHaveBeenCalled()
  })
})

describe('нумерация строк', () => {
  it('включённая нумерация выводит номер каждой строки', () => {
    // getByText нормализует переносы — проверяем textContent напрямую.
    const { container } = setup('один\nдва\nтри', { lineNumbers: true, wordWrap: false })
    expect(container.textContent).toContain('1\n2\n3')
  })

  it('при переносе строк нумерация скрыта (номера не совпали бы с видимыми строками)', () => {
    const { container } = setup('один\nдва', { lineNumbers: true, wordWrap: true })
    expect(container.textContent).not.toContain('1\n2')
  })
})
