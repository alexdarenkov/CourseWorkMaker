import { SegButton } from 'md2docx-frontend'

/** SegButton всегда живёт внутри пилюли-контейнера — как на странице входа. */
export function Segment() {
  return (
    <div style={{ display: 'flex', gap: 3, borderRadius: 11, background: '#f0eee6', padding: 3, width: 260 }}>
      <SegButton active onClick={() => {}}>
        Вход
      </SegButton>
      <SegButton active={false} onClick={() => {}}>
        Регистрация
      </SegButton>
    </div>
  )
}
