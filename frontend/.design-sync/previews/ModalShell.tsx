import { ModalCloseButton, ModalShell } from 'md2docx-frontend'

/** Настоящая композиция из SettingsModal: заголовок + крестик + список строк. */
export function Default() {
  return (
    <ModalShell onClose={() => {}} width={420} maxHeight="360px">
      <div style={{ display: 'flex', alignItems: 'center', padding: '20px 24px 14px' }}>
        <h2 style={{ margin: 0, fontFamily: 'serif', fontSize: 22, fontWeight: 400 }}>
          Настройки документа
        </h2>
        <div style={{ flex: 1 }} />
        <ModalCloseButton onClose={() => {}} />
      </div>
      <div style={{ padding: '0 24px 20px', color: '#6b6553', fontSize: 13.5, lineHeight: 1.5 }}>
        Титульный лист, содержание и нумерация рисунков и таблиц — переключатели
        и поля появляются здесь.
      </div>
    </ModalShell>
  )
}
