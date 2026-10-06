import { useCallback, useEffect, useRef, useState } from 'react'
import { convertApi } from '../api'
import { AppHeader } from '../components/AppHeader'
import { EditorPane } from '../components/EditorPane'
import { PreviewPane } from '../components/PreviewPane'
import { SettingsModal } from '../components/SettingsModal'
import { Toast } from '../components/Toast'
import { SegButton, SegmentedControl } from '../components/ui'
import { useCaretMarker } from '../hooks/useCaretMarker'
import { useDocPersistence } from '../hooks/useDocPersistence'
import { usePagination } from '../hooks/usePagination'
import { useScrollSync } from '../hooks/useScrollSync'
import { useToast } from '../hooks/useToast'
import { useZoom, ZOOM_MAX, ZOOM_MIN } from '../hooks/useZoom'
import { addImageAsset, getAsset, importAssets, referencedAssets } from '../lib/assets'
import {
  baseName,
  findLocalRefs,
  fixZipName,
  isMacJunk,
  mimeOf,
  normPath,
  pickFiles,
  pickMainMdEntry,
  relinkLocalRefs,
} from '../lib/docImport'
import { MAX_ARCHIVE_BYTES, readDocumentArchive, unpackArchive } from '../lib/docArchive'
import { safeFileName, triggerDownload } from '../lib/docExport'
import { replaceEditorSelection } from '../lib/editorInsert'
import { consumeHomeAction } from '../lib/handoff'
import { mermaidToPng } from '../lib/mermaidRenderer'
import { parseMD } from '../lib/markdown'
import { EDITOR_ONLY_KEYS, Settings } from '../lib/settings'
import { loadEditorDraft } from '../lib/storage'
import { applyTheme, effectiveTheme, onSystemThemeChange } from '../lib/theme'

export function EditorPage() {
  const [persisted] = useState(loadEditorDraft)

  const [md, setMd] = useState(persisted.md)
  const [settings, setSettings] = useState<Settings>(persisted.s)
  const [split, setSplit] = useState(0.5)
  const [collapsed, setCollapsed] = useState<'none' | 'editor' | 'preview'>('none')
  // Ниже ~768px редактор и превью side-by-side не помещаются (минимальная
  // ширина панелей вместе ~700px) — переключаемся на вкладки «Редактор/Превью»
  // поверх того же collapsed-механизма вместо доступного только мышью
  // перетаскивания сплиттера.
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    setCollapsed((c) => {
      if (isNarrow) return c === 'none' ? 'preview' : c
      return c === 'none' ? c : 'none'
    })
  }, [isNarrow])
  // Наведение на ручку-ресайз / свёрнутую полосу: подсветка и «вырастание»
  // язычка (дизайн v2).
  const [splitHover, setSplitHover] = useState(false)
  const [downloading, setDownloading] = useState<false | 'docx'>(false)
  const [settingsSection, setSettingsSection] = useState<'doc' | 'ed' | null>(null)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  // Актуальные значения для отложенных колбэков.
  const stateRef = useRef({ md, settings })
  stateRef.current = { md, settings }

  const { toast, showToast } = useToast()

  useEffect(() => applyTheme(settings.theme), [settings.theme])

  // При «системной» теме следим за переключением темы в ОС.
  const [, bumpTheme] = useState(0)
  useEffect(() => {
    if (settings.theme !== 'auto') return
    return onSystemThemeChange(() => {
      applyTheme('auto')
      bumpTheme((x) => x + 1)
    })
  }, [settings.theme])

  /* ---------- пагинация ---------- */

  const { pages, anchors, doPaginate, schedulePaginate } = usePagination(stateRef)

  /* ---------- сохранение (только localStorage) ---------- */

  const { scheduleSave, manualSave, saveStatus } = useDocPersistence({ stateRef, showToast })

  /* ---------- масштаб ---------- */

  const { setZoom, zoomValue, userZoomed, fitZoom } = useZoom(previewRef)

  /* ---------- синхронная прокрутка панелей ---------- */

  useScrollSync({ taRef, previewRef, anchors, pages, zoom: zoomValue, md, settings, collapsed })

  // Каретка редактора, показанная в превью на своём месте в тексте.
  const caret = useCaretMarker({ taRef, stripRef, md, zoom: zoomValue, pages })

  useEffect(() => {
    doPaginate()
    requestAnimationFrame(fitZoom)
    const onResize = () => {
      if (!userZoomed.current) fitZoom()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [doPaginate, fitZoom])

  // Сворачивание/разворачивание панелей меняет ширину превью — подгоняем масштаб.
  useEffect(() => {
    if (!userZoomed.current) requestAnimationFrame(fitZoom)
  }, [collapsed, fitZoom])

  /* ---------- обработчики ---------- */

  const onMdChange = useCallback(
    (v: string) => {
      setMd(v)
      schedulePaginate()
      scheduleSave()
    },
    [schedulePaginate, scheduleSave],
  )

  const onSettingChange = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }))
      scheduleSave()
      if (!EDITOR_ONLY_KEYS.includes(key)) schedulePaginate()
    },
    [schedulePaginate, scheduleSave],
  )

  const insertSnippet = useCallback(
    (snippet: string) => {
      const ta = taRef.current
      const cur = stateRef.current.md
      if (!ta) {
        onMdChange(cur + snippet)
        return
      }
      const st = ta.selectionStart
      const before = cur.slice(0, st)
      const pad = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
      const text = pad + snippet
      replaceEditorSelection(ta, text)
      onMdChange(ta.value)
    },
    [onMdChange],
  )

  const insertImage = useCallback(
    async (file: File) => {
      try {
        const key = await addImageAsset(file)
        const name = file.name.replace(/\.[^.]+$/, '') || 'Название рисунка'
        insertSnippet(`Рисунок: ${name}\n![${name}](${key})\n`)
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Не удалось добавить изображение')
      }
    },
    [insertSnippet, showToast],
  )

  // Применяет загруженный документ: переписывает локальные ссылки на asset-ключи
  // из keyBySrc, грузит текст и кладёт картинки в хранилище. Имя файла — в тему
  // (титульник + имя экспорта).
  const applyLoadedDoc = useCallback(
    (text: string, name: string, keyBySrc: Map<string, string>, localCount: number) => {
      const { out, linked } = relinkLocalRefs(text, keyBySrc)
      if (name) onSettingChange('topic', name)
      onMdChange(out)
      const left = localCount - linked
      if (localCount === 0) showToast('Документ загружен')
      else showToast(`Документ загружен · картинок подставлено: ${linked}, заглушек: ${left}`)
    },
    [onMdChange, onSettingChange, showToast],
  )

  const uploadArchive = useCallback(
    async (file: File) => {
      let entries: Record<string, Uint8Array>
      try {
        if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Архив больше 32 МБ')
        entries = await unpackArchive(new Uint8Array(await file.arrayBuffer()))
        const restored = readDocumentArchive(entries)
        if (restored) {
          if (stateRef.current.md.trim() && !window.confirm('Заменить текущий документ содержимым архива?')) return
          importAssets(restored.assets)
          setSettings(restored.settings)
          onMdChange(restored.md)
          showToast('Документ восстановлен из ZIP')
          return
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Не удалось распаковать архив')
        return
      }
      // Чиним кириллицу в именах (latin1→UTF-8) и отсеиваем служебные файлы
      // macOS. Храним соответствие исправленного имени → оригинального ключа
      // (по нему читаем байты из entries).
      const files = Object.keys(entries)
        .filter((n) => !n.endsWith('/') && !isMacJunk(fixZipName(n)))
        .map((orig) => ({ orig, name: fixZipName(orig) }))
      // markdown-файл: корневой/самый короткий путь.
      const mdFile = pickMainMdEntry(files)
      if (!mdFile) {
        showToast('В архиве нет .md файла')
        return
      }
      if (stateRef.current.md.trim() && !window.confirm('Заменить текущий документ содержимым архива?')) {
        return
      }
      const text = new TextDecoder().decode(entries[mdFile.orig])
      if (text.length > 2_000_000) { showToast('Документ слишком большой'); return }
      const name = (mdFile.name.split('/').pop() || 'Курсовая работа').replace(/\.(md|markdown|txt)$/i, '')
      const localRefs = findLocalRefs(text)

      // Картинки архива по нормализованному пути и по имени файла (normPath/
      // baseName приводят Unicode к NFC: macOS хранит имена в NFD).
      const imgByPath = new Map<string, string>()
      const imgByBase = new Map<string, string | null>()
      for (const f of files) {
        if (/\.(png|jpe?g|gif|webp)$/i.test(f.name)) {
          imgByPath.set(normPath(f.name), f.orig)
          const base = baseName(f.name)
          imgByBase.set(base, imgByBase.has(base) ? null : f.orig)
        }
      }

      const keyBySrc = new Map<string, string>()
      const keyByEntry = new Map<string, string>()
      for (const src of localRefs) {
        const mdDirectory = mdFile.name.slice(0, mdFile.name.lastIndexOf('/') + 1)
        const entry = imgByPath.get(normPath(mdDirectory + src)) ?? imgByPath.get(normPath(src)) ?? imgByBase.get(baseName(src))
        if (!entry) continue
        try {
          if (!keyByEntry.has(entry)) {
            const f = new File([entries[entry] as BlobPart], baseName(fixZipName(entry)) || 'image', {
              type: mimeOf(entry),
            })
            keyByEntry.set(entry, await addImageAsset(f))
          }
          keyBySrc.set(src, keyByEntry.get(entry)!)
        } catch {
          /* пропускаем нечитаемую картинку */
        }
      }
      applyLoadedDoc(text, name, keyBySrc, localRefs.length)
    },
    [applyLoadedDoc, onMdChange, showToast],
  )

  const uploadMd = useCallback(
    async (file: File) => {
      if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
        await uploadArchive(file)
        return
      }
      if (file.size > 8 * 1024 * 1024) { showToast('Markdown-файл больше 8 МБ'); return }
      let text = ''
      try {
        text = await file.text()
        if (text.length > 2_000_000) throw new Error('Документ слишком большой')
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Не удалось прочитать файл')
        return
      }
      if (stateRef.current.md.trim() && !window.confirm('Заменить текущий документ содержимым файла?')) {
        return
      }
      const name = file.name.replace(/\.(md|markdown|txt)$/i, '') || 'Курсовая работа'
      const localRefs = findLocalRefs(text)

      // Для одиночного .md картинок нет — предлагаем приложить их с устройства.
      const keyBySrc = new Map<string, string>()
      if (localRefs.length > 0) {
        const attach = window.confirm(
          `В файле ${localRefs.length} изображений со ссылками на локальные файлы.\n` +
            'Приложить их с устройства? (или загрузите архив .zip с картинками внутри)',
        )
        if (attach) {
          const files = await pickFiles('image/*', true)
          const byBase = new Map<string, File>()
          for (const f of files) byBase.set(f.name.toLowerCase(), f)
          const keyByBase = new Map<string, string>()
          for (const src of localRefs) {
            const base = src.split(/[\\/]/).pop()?.toLowerCase() ?? ''
            const f = byBase.get(base)
            if (f && !keyByBase.has(base)) {
              try {
                keyByBase.set(base, await addImageAsset(f))
              } catch {
                /* пропускаем нечитаемый файл */
              }
            }
            const key = keyByBase.get(base)
            if (key) keyBySrc.set(src, key)
          }
        }
      }
      applyLoadedDoc(text, name, keyBySrc, localRefs.length)
    },
    [applyLoadedDoc, uploadArchive, showToast],
  )

  // Открыть файл, переданный с другой страницы.
  useEffect(() => {
    const action = consumeHomeAction()
    if (!action) return
    void uploadMd(action.file)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- экспорт ---------- */

  // Имя скачиваемого файла — тема работы (настройки титульника).
  const exportName = useCallback(
    () => (stateRef.current.settings.topic || '').trim() || 'Курсовая работа',
    [],
  )

  const download = useCallback(
    async (format: 'docx') => {
      if (downloading) return
      setDownloading(format)
      try {
        const { md: m, settings: s } = stateRef.current
        const assets: Record<string, string> = referencedAssets(m)
        // Логотип титульника — ассет вне markdown, конвертеру нужен явно.
        if (s.titleLogo?.startsWith('asset:')) {
          const value = getAsset(s.titleLogo)
          if (value) assets[s.titleLogo] = value
        }
        const mermaidBlocks = parseMD(m).filter((b) => b.type === 'mermaid')
        await Promise.all(
          mermaidBlocks.map(async (b, i) => {
            if (b.type !== 'mermaid') return
            const png = await mermaidToPng(b.code)
            if (png) assets[`mermaid-${i}`] = png
          }),
        )
        // Серверная конвертация (Pandoc-формулы).
        const name = safeFileName(exportName())
        const blob = await convertApi.docx(m, name, s, assets)
        triggerDownload(blob, `${name}.${format}`)
        showToast(`Файл «${name}.${format}» скачан`)
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Не удалось сформировать файл')
      } finally {
        setDownloading(false)
      }
    },
    [downloading, exportName, showToast],
  )

  // Ручка-ресайз (дизайн v2): перетаскивание меняет ширину; при уводе за
  // ~20% ширины соответствующая панель сворачивается (обратно — язычок).
  const splitDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        document.body.style.userSelect = ''
        if (!userZoomed.current) fitZoom()
      }
      const move = (ev: MouseEvent) => {
        const pct = ev.clientX / window.innerWidth
        if (pct < 0.2) {
          setCollapsed('editor')
          setSplitHover(false)
          up()
          return
        }
        if (pct > 0.8) {
          setCollapsed('preview')
          setSplitHover(false)
          up()
          return
        }
        setSplit(Math.max(0.22, Math.min(0.78, pct)))
      }
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    },
    [fitZoom],
  )

  const expand = useCallback(() => {
    setCollapsed('none')
    setSplitHover(false)
    setSplit(0.5)
  }, [])

  /** Свёрнутая полоса с язычком-стрелкой (в стиле iOS): наведение растит
   *  язычок, клик разворачивает панель обратно (дизайн v2). */
  const collapsedStrip = (side: 'editor' | 'preview') => (
    <div
      onClick={expand}
      onMouseEnter={() => setSplitHover(true)}
      onMouseLeave={() => setSplitHover(false)}
      title={side === 'editor' ? 'Открыть редактор' : 'Открыть превью'}
      className="relative z-10 flex cursor-pointer items-center overflow-visible transition-colors"
      style={{
        width: 9,
        flexShrink: 0,
        justifyContent: side === 'editor' ? 'flex-start' : 'flex-end',
        background: splitHover ? 'var(--split-hover)' : 'transparent',
        borderRight: side === 'editor' ? '1px solid var(--line)' : 'none',
        borderLeft: side === 'preview' ? '1px solid var(--line)' : 'none',
      }}
    >
      <span
        className="flex flex-shrink-0 items-center justify-center text-white transition-all duration-200"
        style={{
          width: splitHover ? 36 : 18,
          height: 52,
          marginLeft: side === 'editor' ? -2 : 0,
          marginRight: side === 'preview' ? -2 : 0,
          borderRadius: side === 'editor' ? '0 10px 10px 0' : '10px 0 0 10px',
          background: splitHover ? 'var(--accent)' : 'var(--edge)',
          boxShadow: `${side === 'editor' ? 2 : -2}px 0 8px rgba(0,0,0,.2)`,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          {side === 'editor' ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
        </svg>
      </span>
    </div>
  )

  return (
    <div className="editor-page flex h-dvh flex-col bg-paper text-ink">
      <AppHeader
        active="editor"
        docx={{ downloading: Boolean(downloading), onDownload: () => void download('docx') }}
        theme={effectiveTheme(settings.theme)}
        onToggleTheme={() =>
          onSettingChange('theme', effectiveTheme(settings.theme) === 'dark' ? 'light' : 'dark')
        }
      />

      {isNarrow && (
        <div className="narrow-tabs flex flex-shrink-0 border-b border-line bg-surface px-3 py-2">
          <SegmentedControl label="Панель редактора" className="flex-1">
            <SegButton active={collapsed === 'preview'} onClick={() => setCollapsed('preview')}>
              Редактор
            </SegButton>
            <SegButton active={collapsed === 'editor'} onClick={() => setCollapsed('editor')}>
              Превью
            </SegButton>
          </SegmentedControl>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {collapsed === 'editor' ? (
          isNarrow ? null : collapsedStrip('editor')
        ) : (
          <EditorPane
            md={md}
            settings={settings}
            width={collapsed === 'preview' ? '100%' : `calc(${(split * 100).toFixed(1)}% - 4.5px)`}
            taRef={taRef}
            onChange={onMdChange}
            onSave={manualSave}
            onInsert={insertSnippet}
            onInsertImage={insertImage}
            onUploadMd={uploadMd}
            onToast={showToast}
            onOpenSettings={() => setSettingsSection('ed')}
          />
        )}
        {collapsed === 'none' && (
          <div
            onMouseDown={splitDown}
            onMouseEnter={() => setSplitHover(true)}
            onMouseLeave={() => setSplitHover(false)}
            title="Перетащите, чтобы изменить размер (до упора — свернуть панель)"
            className="z-10 flex flex-shrink-0 cursor-col-resize items-center justify-center transition-colors"
            style={{
              width: 9,
              background: splitHover ? 'var(--split-hover)' : 'transparent',
              // Левая граница — правый край панели редактора, правая — своя:
              // иначе со стороны превью шторка не отделена линией.
              borderRight: '1px solid var(--line)',
            }}
          >
            <span
              className="rounded-full transition-all duration-200"
              style={{
                width: 3,
                height: splitHover ? 44 : 36,
                background: splitHover ? 'var(--accent)' : 'var(--edge)',
              }}
            />
          </div>
        )}
        {collapsed === 'preview' ? (
          isNarrow ? null : collapsedStrip('preview')
        ) : (
          <PreviewPane
            pages={pages}
            stripRef={stripRef}
            caret={caret}
            zoom={zoomValue}
            previewRef={previewRef}
            onZoomIn={() => {
              userZoomed.current = true
              setZoom(Math.min(ZOOM_MAX, Math.round(zoomValue * 10 + 1) / 10))
            }}
            onZoomOut={() => {
              userZoomed.current = true
              setZoom(Math.max(ZOOM_MIN, Math.round(zoomValue * 10 - 1) / 10))
            }}
            onZoomFit={() => {
              userZoomed.current = false
              fitZoom()
            }}
            onOpenSettings={() => setSettingsSection('doc')}
            saveFailed={saveStatus.startsWith('Не сохранено')}
            onRetrySave={manualSave}
          />
        )}
      </div>


      {settingsSection && (
        <SettingsModal
          settings={settings}
          section={settingsSection}
          onChange={onSettingChange}
          onClose={() => setSettingsSection(null)}
        />
      )}
      {toast && <Toast message={toast} />}
    </div>
  )
}
