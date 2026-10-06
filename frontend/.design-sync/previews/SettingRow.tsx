import { SettingRow, Toggle } from 'md2docx-frontend'
import { useState } from 'react'

/** Строка настройки с тумблером — самый частый случай (SettingsModal). */
export function WithToggle() {
  const [on, setOn] = useState(true)
  return (
    <div style={{ width: 360 }}>
      <SettingRow label="Содержание" desc="Автогенерация из заголовков с номерами страниц">
        <Toggle on={on} onToggle={() => setOn((v) => !v)} />
      </SettingRow>
    </div>
  )
}

/** Строка со слайдером вместо тумблера — размер шрифта редактора. */
export function WithControl() {
  return (
    <div style={{ width: 360 }}>
      <SettingRow label="Размер шрифта" desc="Моноширинный шрифт редактора">
        <input type="range" min={12} max={18} defaultValue={14} style={{ width: 120 }} />
      </SettingRow>
    </div>
  )
}
