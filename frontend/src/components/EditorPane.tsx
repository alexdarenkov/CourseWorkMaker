import { RefObject, useMemo, useRef, useState } from 'react'
import { edColors, highlight } from '../lib/highlight'
import { esc } from '../lib/markdown'
import type { Settings } from '../lib/settings'
import { effectiveTheme } from '../lib/theme'
import { BoldIcon, CodeIcon, CollapseLeftIcon, DiagramIcon, GearIcon, HeadingIcon, ImageIcon, ItalicIcon, MathIcon, TableIcon, UploadIcon } from './icons'
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
  onCollapse: () => void
  onToast: (msg: string) => void
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
  const C = edColors(effectiveTheme(s.theme))
  const preRef = useRef<HTMLPreElement>(null)
  const gutRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mdFileRef = useRef<HTMLInputElement>(null)
  // Файл тянут над редактором (счётчик — dragenter/dragleave прилетают от
  // дочерних элементов парами).
  const dragDepth = useRef(0)
  const [dragOver, setDragOver] = useState(false)

  const wrap = s.wordWrap
  const showGutter = s.lineNumbers && !wrap
  const lineCount = md.split('\n').length

  // Разделы документа (h1/h2 вне код-фенсов) — быстрый переход из тулбара.
  const sections = useMemo(() => {
    const out: { label: string; line: number }[] = []
    let inCode = false
    md.split('\n').forEach((l, i) => {
      if (l.trim().startsWith('```')) inCode = !inCode
      const m = inCode ? null : l.match(/^(#{1,2})\s+(.+)/)
      if (m) out.push({ label: (m[1].length === 2 ? ' ' : '') + m[2].trim(), line: i })
    })
    return out
  }, [md])

  const jumpToLine = (line: number) => {
    const ta = props.taRef.current
    if (!ta) return
    const offset = md.split('\n').slice(0, line).join('\n').length + (line > 0 ? 1 : 0)
    ta.focus()
    ta.setSelectionRange(offset, offset)
    // Строка раздела — в верхней трети окна (при переносе строк — приближённо).
    ta.scrollTop = Math.max(0, line * Math.round(s.fontSize * 1.65) - 80)
  }
  const mono = "'JetBrains Mono',ui-monospace,Menlo,monospace"
  // Целочисленная высота строки в пикселях (а не дробный множитель 1.65):
  // дробный line-height браузеры округляют по-разному в textarea, pre и
  // нумерации, из-за чего слои накапливают вертикальное расхождение — номера
  // «съезжают» от строк, а каретка встаёт выше своей строки. Целое число px
  // даёт строго одинаковую высоту строки во всех трёх слоях.
  const lh = Math.round(s.fontSize * 1.65) + 'px'

  const onScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    if (preRef.current) {
      preRef.current.scrollTop = t.scrollTop
      preRef.current.scrollLeft = t.scrollLeft
    }
    if (gutRef.current) gutRef.current.scrollTop = t.scrollTop
  }

  /** Оборачивает выделение маркером (**жирный** / *курсив*); при пустом
   *  выделении вставляет пару маркеров и ставит каретку между ними. */
  const wrapSelection = (ta: HTMLTextAreaElement, marker: string) => {
    const st = ta.selectionStart
    const en = ta.selectionEnd
    const scrollTop = ta.scrollTop
    const sel = ta.value.slice(st, en)
    // setRangeText сохраняет нативный undo-стек textarea.
    ta.setRangeText(marker + sel + marker, st, en, 'end')
    if (st === en) ta.setSelectionRange(st + marker.length, st + marker.length)
    else ta.setSelectionRange(st + marker.length, en + marker.length)
    ta.scrollTop = scrollTop
    props.onChange(ta.value)
  }

  /** Циклический заголовок для текущей строки: нет → # → ## → ### → нет. */
  const cycleHeading = () => {
    const ta = props.taRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const start = md.lastIndexOf('\n', pos - 1) + 1
    let end = md.indexOf('\n', pos)
    if (end < 0) end = md.length
    const line = md.slice(start, end)
    const m = line.match(/^(#{1,3})\s+/)
    const next =
      m === null ? '# ' + line : m[1].length < 3 ? '#' + line : line.replace(/^#{3}\s+/, '')
    const scrollTop = ta.scrollTop
    ta.focus()
    ta.setSelectionRange(start, end)
    ta.setRangeText(next, start, end, 'end')
    ta.scrollTop = scrollTop
    props.onChange(ta.value)
  }

  /* ---------- drag&drop файлов ---------- */

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type.startsWith('image/')) props.onInsertImage(file)
    else if (/\.(md|markdown|txt|zip)$/i.test(file.name)) props.onUploadMd(file)
    else props.onToast('Поддерживаются изображения, .md и .zip')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const st = ta.selectionStart
      const en = ta.selectionEnd
      props.onChange(md.slice(0, st) + '  ' + md.slice(en))
      requestAnimationFrame(() => ta.setSelectionRange(st + 2, st + 2))
      return
    }
    // e.code — физическая клавиша: работает и в русской раскладке (Ctrl+И = жирный).
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      if (e.code === 'KeyS') {
        e.preventDefault()
        props.onSave()
      } else if (e.code === 'KeyB') {
        e.preventDefault()
        wrapSelection(e.currentTarget, '**')
      } else if (e.code === 'KeyI') {
        e.preventDefault()
        wrapSelection(e.currentTarget, '*')
      }
    }
  }

  return (
    <section
      className="relative flex min-h-0 flex-col border-r border-line bg-surface"
      style={{ width: props.width, minWidth: 340 }}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        dragDepth.current++
        setDragOver(true)
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault()
      }}
      onDragLeave={() => {
        if (--dragDepth.current <= 0) {
          dragDepth.current = 0
          setDragOver(false)
        }
      }}
      onDrop={onDrop}
    >
      {dragOver && (
        <div
          className="pointer-events-none absolute z-20 flex items-center justify-center rounded-xl text-[13.5px] font-semibold"
          style={{
            inset: 8,
            border: '2px dashed #d97757',
            background: 'color-mix(in srgb, var(--warm-bg) 82%, transparent)',
            color: 'var(--warm)',
          }}
        >
          Отпустите: картинка вставится в текст, .md/.zip — откроется как документ
        </div>
      )}
      <div className="flex h-[38px] flex-shrink-0 items-center gap-1 border-b border-hover pl-2.5 pr-2.5">
        <input
          ref={mdFileRef}
          type="file"
          accept=".md,.markdown,.txt,.zip,text/markdown,text/plain,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) props.onUploadMd(f)
            e.target.value = ''
          }}
        />
        <IconButton
          title="Загрузить .md или .zip (можно просто перетащить файл в редактор)"
          onClick={() => mdFileRef.current?.click()}
        >
          <UploadIcon />
        </IconButton>
        {sections.length > 0 && (
          <select
            value=""
            title="Перейти к разделу"
            onChange={(e) => {
              const line = Number(e.target.value)
              if (!Number.isNaN(line)) jumpToLine(line)
            }}
            className="max-w-[190px] cursor-pointer truncate rounded-[7px] border-none bg-transparent px-1.5 py-1 text-[11.5px] font-medium text-muted hover:bg-hover"
          >
            <option value="" disabled hidden>
              К разделу…
            </option>
            {sections.map((h) => (
              <option key={h.line} value={h.line}>
                {h.label}
              </option>
            ))}
          </select>
        )}
        <div className="flex-1" />
        <IconButton title="Заголовок: цикл # → ## → ### для текущей строки" onClick={cycleHeading}>
          <HeadingIcon />
        </IconButton>
        <IconButton
          title="Жирный (Ctrl/Cmd+B)"
          onClick={() => props.taRef.current && wrapSelection(props.taRef.current, '**')}
        >
          <BoldIcon />
        </IconButton>
        <IconButton
          title="Курсив (Ctrl/Cmd+I)"
          onClick={() => props.taRef.current && wrapSelection(props.taRef.current, '*')}
        >
          <ItalicIcon />
        </IconButton>
        <div className="mx-1 h-4 w-px bg-hover" />
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
        <IconButton title="Свернуть редактор" onClick={props.onCollapse}>
          <CollapseLeftIcon />
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
              padding: '18px 12px 140px 0',
              color: C.dim,
              fontFamily: mono,
              fontSize: s.fontSize,
              lineHeight: lh,
              borderRight: '1px solid ' + C.gutBorder,
            }}
          >
            {/* Единый текстовый блок (а не div на строку): округление высоты
                строк такое же, как у сплошного текста textarea, поэтому номера
                не накапливают вертикальное расхождение. */}
            <div style={{ whiteSpace: 'pre' }}>
              {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
            </div>
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
              // Оба слоя ВСЕГДА резервируют одинаковую ширину под вертикальный
              // скроллбар (overflow-y: scroll). Иначе на длинном документе у
              // textarea появляется скроллбар и она сужается, а pre — нет; из-за
              // разной ширины абзацы переносятся в разном числе строк и текст с
              // курсором/выделением расходятся по вертикали (тем сильнее, чем
              // длиннее документ). scrollbar-gutter на overflow:hidden браузер
              // отрабатывает ненадёжно, поэтому используем реальный скроллбар.
              overflowX: wrap ? 'hidden' : 'auto',
              overflowY: 'scroll',
              fontFamily: mono,
              fontSize: s.fontSize,
              lineHeight: lh,
              whiteSpace: wrap ? 'pre-wrap' : 'pre',
              overflowWrap: wrap ? 'break-word' : 'normal',
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
              lineHeight: lh,
              whiteSpace: wrap ? 'pre-wrap' : 'pre',
              overflowWrap: wrap ? 'break-word' : 'normal',
              // То же, что и у pre: всегда резервируем полосу вертикального
              // скроллбара, чтобы ширина переноса совпадала на любом размере
              // документа.
              overflowX: wrap ? 'hidden' : 'auto',
              overflowY: 'scroll',
            }}
          />
        </div>
      </div>
    </section>
  )
}
