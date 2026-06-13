import { RefObject, useRef } from 'react'
import { edColors, highlight } from '../lib/highlight'
import { esc } from '../lib/markdown'
import type { Settings } from '../lib/settings'
import { CodeIcon, DiagramIcon, GearIcon, ImageIcon, MathIcon, TableIcon, UploadIcon } from './icons'
import { IconButton } from './ui'

interface EditorPaneProps {
  md: string
  settings: Settings
  width: string
  taRef: RefObject<HTMLTextAreaElement>
  onChange: (md: string) => void
  onSave: () => void
  onInsert: (snippet: string) => void
  onInsertImage: (file: File) => void
  onUploadMd: (file: File) => void
  onOpenSettings: () => void
}

const SNIPPETS = {
  table:
    'Таблица: Название таблицы\n| Колонка 1 | Колонка 2 | Колонка 3 |\n|---|---|---|\n| … | … | … |\n',
  code: '```python\n# ваш код\n```\n',
  mermaid:
    'Рисунок: Схема процесса\n```mermaid\nflowchart LR\n  A[Начало] --> B[Процесс]\n  B --> C[Конец]\n```\n',
  math: '$$y = kx + b$$\n',
}

export function EditorPane(props: EditorPaneProps) {
  const { md, settings: s } = props
  const C = edColors(s.theme)
  const preRef = useRef<HTMLPreElement>(null)
  const gutRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mdFileRef = useRef<HTMLInputElement>(null)

  const wrap = s.wordWrap
  const showGutter = s.lineNumbers && !wrap
  const lineCount = md.split('\n').length
  const mono = "'JetBrains Mono',ui-monospace,Menlo,monospace"

  const onScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    if (preRef.current) {
      preRef.current.scrollTop = t.scrollTop
      preRef.current.scrollLeft = t.scrollLeft
    }
    if (gutRef.current) gutRef.current.scrollTop = t.scrollTop
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const st = ta.selectionStart
      const en = ta.selectionEnd
      props.onChange(md.slice(0, st) + '  ' + md.slice(en))
      requestAnimationFrame(() => ta.setSelectionRange(st + 2, st + 2))
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      props.onSave()
    }
  }

  return (
    <section
      className="flex min-h-0 flex-col border-r border-line bg-surface"
      style={{ width: props.width, minWidth: 340 }}
    >
      <div className="flex h-[42px] flex-shrink-0 items-center gap-1 border-b border-hover pl-[22px] pr-2.5">
        <span className="text-[11px] font-bold tracking-[.1em] text-muted">MARKDOWN</span>
        <input
          ref={mdFileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) props.onUploadMd(f)
            e.target.value = ''
          }}
        />
        <IconButton title="Загрузить свой .md файл" onClick={() => mdFileRef.current?.click()}>
          <UploadIcon />
        </IconButton>
        <div className="mx-1 h-4 w-px bg-hover" />
        <div className="flex-1" />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) props.onInsertImage(f)
            e.target.value = ''
          }}
        />
        <IconButton title="Вставить изображение с устройства" onClick={() => fileRef.current?.click()}>
          <ImageIcon />
        </IconButton>
        <IconButton title="Вставить таблицу" onClick={() => props.onInsert(SNIPPETS.table)}>
          <TableIcon />
        </IconButton>
        <IconButton title="Вставить блок кода" onClick={() => props.onInsert(SNIPPETS.code)}>
          <CodeIcon />
        </IconButton>
        <IconButton title="Вставить схему (mermaid)" onClick={() => props.onInsert(SNIPPETS.mermaid)}>
          <DiagramIcon />
        </IconButton>
        <IconButton title="Вставить формулу (LaTeX)" onClick={() => props.onInsert(SNIPPETS.math)}>
          <MathIcon />
        </IconButton>
        <div className="mx-1 h-4 w-px bg-hover" />
        <IconButton title="Настройки редактора" onClick={props.onOpenSettings}>
          <GearIcon size={16} />
        </IconButton>
      </div>
      <div
        className="flex min-h-0 flex-1 transition-colors duration-200"
        style={{ background: C.bg }}
      >
        {showGutter && (
          <div
            ref={gutRef}
            className="select-none overflow-hidden text-right"
            style={{
              width: 50,
              flexShrink: 0,
              padding: '18px 0 140px',
              color: C.dim,
              fontFamily: mono,
              fontSize: s.fontSize,
              lineHeight: 1.65,
              borderRight: '1px solid ' + C.gutBorder,
            }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} style={{ paddingRight: 12 }}>
                {i + 1}
              </div>
            ))}
          </div>
        )}
        <div className="relative min-w-0 flex-1">
          <pre
            ref={preRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              margin: 0,
              padding: '18px 22px 140px 22px',
              overflow: 'hidden',
              fontFamily: mono,
              fontSize: s.fontSize,
              lineHeight: 1.65,
              whiteSpace: wrap ? 'pre-wrap' : 'pre',
              overflowWrap: wrap ? 'break-word' : 'normal',
              // Резервируем ту же полосу под скроллбар, что и у textarea,
              // иначе при переносе строк слои переносят по разной ширине и
              // курсор расходится с подсветкой на несколько строк.
              scrollbarGutter: 'stable',
              color: C.text,
              pointerEvents: 'none',
            }}
            dangerouslySetInnerHTML={{
              __html: (s.syntaxHl ? highlight(md, C) : esc(md)) + '\n',
            }}
          />
          <textarea
            ref={props.taRef}
            value={md}
            onChange={(e) => props.onChange(e.target.value)}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            wrap={wrap ? 'soft' : 'off'}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              margin: 0,
              border: 'none',
              resize: 'none',
              background: 'transparent',
              color: 'transparent',
              caretColor: C.head,
              padding: '18px 22px 140px 22px',
              fontFamily: mono,
              fontSize: s.fontSize,
              lineHeight: 1.65,
              whiteSpace: wrap ? 'pre-wrap' : 'pre',
              overflowWrap: wrap ? 'break-word' : 'normal',
              overflow: 'auto',
              scrollbarGutter: 'stable',
            }}
          />
        </div>
      </div>
    </section>
  )
}
