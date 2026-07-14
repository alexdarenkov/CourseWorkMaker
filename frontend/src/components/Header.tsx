import { useState } from 'react'
import {
  ArchiveIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  MoonIcon,
  ShieldCheckIcon,
  Spinner,
  SunIcon,
  RedoIcon,
  UndoIcon,
} from './icons'
import { IconButton } from './ui'

interface HeaderProps {
  docName: string
  onDocName: (v: string) => void
  downloading: false | 'docx' | 'pdf'
  onDownload: (format: 'docx' | 'pdf') => void
  onExportZip: () => void
  onExportMd: () => void
  onOpenDocs: () => void
  /** Нормоконтроль (перенесён из футера): проверка оформления без ИИ. */
  lintBusy: boolean
  /** Число замечаний последней проверки или null, если не запускалась. */
  lintCount: number | null
  onLint: () => void
  /** История ИИ-изменений текущего отчёта: назад — текст до правки,
   *  вперёд — результат ИИ (кнопки видны, пока история существует). */
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  /** Фактическая тема (auto уже развёрнут в light/dark). */
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onOpenUser: () => void
  userName: string | null
}

/** Пункт выпадающего меню экспорта. */
function MenuItem(props: {
  icon: React.ReactNode
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      onClick={props.onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-[9px] border-none bg-transparent px-3 py-2 text-left hover:bg-hover"
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-hover text-soft">
        {props.icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-semibold text-ink">{props.label}</span>
        <span className="truncate text-[11px] text-muted">{props.hint}</span>
      </span>
    </button>
  )
}

export function Header(props: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const initials = props.userName
    ? props.userName
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : null

  const pick = (action: () => void) => () => {
    setMenuOpen(false)
    action()
  }

  return (
    <header
      className="z-20 flex h-12 flex-shrink-0 items-center gap-3 border-b border-line text-ink pl-4 pr-3.5"
      style={{ background: 'var(--header-bg)' }}
    >
      <div className="flex items-center gap-2" title="md2docx — курсовые по ГОСТ 7.32—2017">
        <div
          className="flex items-center justify-center rounded-lg bg-ink text-paper"
          style={{ width: 26, height: 26, fontFamily: "'Times New Roman',serif", fontSize: 15, fontWeight: 700 }}
        >
          §
        </div>
        <div className="font-mono text-[13px] font-bold tracking-wide">md2docx</div>
      </div>
      <div className="h-5 w-px bg-line" />
      <div className="flex min-w-0 items-center gap-0.5">
        <input
          value={props.docName}
          onChange={(e) => props.onDocName(e.target.value)}
          title="Название документа"
          className="w-56 truncate rounded-[7px] border-none bg-transparent px-2 py-1 text-[13.5px] font-medium text-ink hover:bg-hover focus:bg-hover"
        />
        <IconButton title="Мои документы (облако)" onClick={props.onOpenDocs}>
          <FolderIcon />
        </IconButton>
      </div>
      <div className="flex-1" />
      {(props.canBack || props.canForward) && (
        <div className="flex items-center">
          <button
            onClick={props.onBack}
            disabled={!props.canBack}
            title="Назад: вернуть текст до ИИ-изменения (в рамках текущего отчёта)"
            className="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-muted hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-35"
            style={{ width: 30, height: 30 }}
          >
            <UndoIcon />
          </button>
          <button
            onClick={props.onForward}
            disabled={!props.canForward}
            title="Вперёд: вернуть результат ИИ (в рамках текущего отчёта)"
            className="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-muted hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-35"
            style={{ width: 30, height: 30 }}
          >
            <RedoIcon />
          </button>
        </div>
      )}
      <button
        onClick={props.onLint}
        disabled={props.lintBusy}
        title="Нормоконтроль: проверить оформление по ГОСТ — подписи, ссылки на источники, заголовки, габариты таблиц и схем"
        className="relative flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-60"
        style={{ width: 34, height: 34 }}
      >
        {props.lintBusy ? <Spinner /> : <ShieldCheckIcon />}
        {!props.lintBusy && props.lintCount !== null && (
          <span
            className="absolute rounded-full px-1 text-[9.5px] font-bold leading-[14px]"
            style={{
              top: 1,
              right: -2,
              background: props.lintCount > 0 ? 'rgba(217,162,63,.9)' : 'rgba(93,138,82,.9)',
              color: '#fff',
            }}
          >
            {props.lintCount > 0 ? props.lintCount : '✓'}
          </span>
        )}
      </button>

      {/* Единая кнопка экспорта: .docx — основное действие, остальное в меню. */}
      <div className="relative">
        {menuOpen && (
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
        )}
        <div className="flex items-center">
          <button
            onClick={() => props.onDownload('docx')}
            title="Скачать документ DOCX"
            className="flex cursor-pointer items-center gap-2 rounded-l-full border-none bg-accent py-1.5 pl-3.5 pr-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-dark"
          >
            {props.downloading ? <Spinner /> : <DownloadIcon />}
            <span>{props.downloading ? 'Готовим файл…' : 'Скачать .docx'}</span>
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="Другие форматы экспорта"
            className="flex cursor-pointer items-center self-stretch rounded-r-full border-none bg-accent pl-1.5 pr-2.5 text-white transition-colors hover:bg-accent-dark"
            style={{ boxShadow: 'inset 1px 0 rgba(255,255,255,.25)' }}
          >
            <ChevronDownIcon />
          </button>
        </div>
        {menuOpen && (
          <div
            className="absolute right-0 top-full z-40 mt-2 flex flex-col overflow-hidden bg-surface p-1.5"
            style={{
              width: 300,
              borderRadius: 14,
              boxShadow: '0 12px 40px rgba(61,57,41,.22), 0 0 0 1px var(--edge)',
            }}
          >
            <MenuItem
              icon={<DownloadIcon size={15} />}
              label="PDF"
              hint="Печатная версия с заполненным содержанием"
              onClick={pick(() => props.onDownload('pdf'))}
            />
            <MenuItem
              icon={<ArchiveIcon size={15} />}
              label="Архив .zip"
              hint="Markdown + картинки — бэкап и перенос"
              onClick={pick(props.onExportZip)}
            />
            <MenuItem
              icon={<FileTextIcon size={15} />}
              label="Файл .md"
              hint="Только текст, без картинок"
              onClick={pick(props.onExportMd)}
            />
          </div>
        )}
      </div>

      <IconButton
        title={props.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        onClick={props.onToggleTheme}
        size={34}
      >
        {props.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </IconButton>
      <button
        onClick={props.onOpenUser}
        title={initials ? 'Профиль' : 'Войти'}
        className="flex cursor-pointer items-center justify-center rounded-full border-none text-[11px] font-bold tracking-wide"
        style={{
          width: 30,
          height: 30,
          background: 'var(--avatar)',
          color: 'var(--warm)',
        }}
      >
        {initials ?? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )}
      </button>
    </header>
  )
}
