/** Каталог общих компонентов: только dev-сервер, без API и пользовательских данных. */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Badge,
  Button,
  Card,
  ModalCloseButton,
  ModalShell,
  Notice,
  RangeField,
  SegButton,
  SegmentedControl,
  SettingRow,
  TextAreaField,
  TextField,
  Toggle,
} from './components/ui'
import { applyTheme } from './lib/theme'
import './index.css'

function ComponentGallery() {
  const [dark, setDark] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [modal, setModal] = useState(false)
  const [segment, setSegment] = useState(0)
  const [size, setSize] = useState(14)
  return (
    <main className="h-screen overflow-auto bg-paper p-6 text-ink sm:p-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="ui-eyebrow">TEXTURN / UI</p>
            <h1 className="ui-title">Компоненты интерфейса</h1>
            <p className="ui-hint mt-3">
              Тема: src/styles/tokens.css · Компоненты: src/components/ui.tsx
            </p>
          </div>
          <Button
            onClick={() => {
              setDark(!dark)
              applyTheme(dark ? 'light' : 'dark')
            }}
          >
            {dark ? 'Светлая тема' : 'Тёмная тема'}
          </Button>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <h2 className="ui-section-title mb-5">Кнопки и состояния</h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Основная</Button>
              <Button>Вторичная</Button>
              <Button variant="ghost">Без фона</Button>
              <Button variant="danger">Удалить</Button>
              <Button disabled>Недоступно</Button>
              <Button variant="primary" busy>
                Сохраняем…
              </Button>
              <Button size="sm">Компактная</Button>
              <Button size="lg">Крупная</Button>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="ui-section-title mb-5">Выбор и переключатели</h2>
            <SegmentedControl label="Режим просмотра">
              {['Редактор', 'Превью'].map((label, i) => (
                <SegButton
                  key={label}
                  active={segment === i}
                  onClick={() => setSegment(i)}
                >
                  {label}
                </SegButton>
              ))}
            </SegmentedControl>
            <SettingRow
              label="Нумерация страниц"
              desc="Общий переключатель с клавиатурным управлением"
            >
              <Toggle
                label="Нумерация страниц"
                on={enabled}
                onToggle={() => setEnabled(!enabled)}
              />
            </SettingRow>
            <SettingRow label="Размер шрифта" desc={`${size} px`}>
              <RangeField
                label="Размер шрифта"
                min={12}
                max={18}
                value={size}
                onChange={(e) => setSize(+e.target.value)}
              />
            </SettingRow>
          </Card>
          <Card className="p-6">
            <h2 className="ui-section-title mb-5">Поля</h2>
            <div className="grid gap-4">
              <TextField label="Имя" placeholder="Анна Смирнова" />
              <TextField
                label="Недоступное поле"
                disabled
                value="anna@example.test"
              />
              <TextAreaField
                label="Описание"
                rows={3}
                placeholder="Несколько строк текста"
              />
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="ui-section-title mb-5">Сообщения и окна</h2>
            <div className="grid gap-4">
              <div>
                <Badge>Texturn</Badge>
              </div>
              <Notice>Работа хранится в этом браузере.</Notice>
              <Notice tone="error">
                Не удалось сохранить изменения. Попробуйте ещё раз.
              </Notice>
              <Notice tone="warning">
                Проверьте доступное место в браузере.
              </Notice>
              <Button onClick={() => setModal(true)}>Открыть окно</Button>
            </div>
          </Card>
        </div>
      </div>
      {modal && (
        <ModalShell
          label="Пример окна"
          width={480}
          maxHeight="85dvh"
          onClose={() => setModal(false)}
        >
          <div className="flex items-center justify-between p-6">
            <h2 className="ui-section-title">Пример окна</h2>
            <ModalCloseButton onClose={() => setModal(false)} />
          </div>
          <div className="px-6 pb-6">
            <TextField label="Название" placeholder="Моя работа" />
            <p className="ui-hint my-4">
              Tab остаётся внутри окна. Escape закрывает его.
            </p>
            <Button variant="primary" onClick={() => setModal(false)}>
              Готово
            </Button>
          </div>
        </ModalShell>
      )}
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<ComponentGallery />)
