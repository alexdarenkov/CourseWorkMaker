import { AppHeader } from 'md2docx-frontend'

/** Шапка главной/профиля: логотип, «Редактор», тема, вход/аватар. */
export function Default() {
  return <AppHeader />
}

/** Шапка редактора: активный пункт навигации + кнопка «Скачать DOCX». */
export function EditorWithDownload() {
  return (
    <AppHeader
      active="editor"
      docx={{ downloading: false, onDownload: () => {} }}
      theme="light"
      onToggleTheme={() => {}}
    />
  )
}
