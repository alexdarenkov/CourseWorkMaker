import { Toggle } from 'md2docx-frontend'

/** Оба состояния рядом — единственная переменная тумблера. */
export function States() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', fontSize: 11 }}>
        Выкл
        <Toggle on={false} onToggle={() => {}} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', fontSize: 11 }}>
        Вкл
        <Toggle on onToggle={() => {}} />
      </label>
    </div>
  )
}
