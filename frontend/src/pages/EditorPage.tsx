import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { convertApi } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AiConsole } from '../components/AiConsole'
import { EditorPane } from '../components/EditorPane'
import { Header } from '../components/Header'
import { PreviewPane } from '../components/PreviewPane'
import { CollapseLeftIcon, CollapseRightIcon } from '../components/icons'
import { IconButton } from '../components/ui'
import { SettingsModal } from '../components/SettingsModal'
import { Toast } from '../components/Toast'
import { UserModal } from '../components/UserModal'
import { useAiJob } from '../hooks/useAiJob'
import { useDocPersistence } from '../hooks/useDocPersistence'
import { usePagination } from '../hooks/usePagination'
import { useToast } from '../hooks/useToast'
import { useZoom } from '../hooks/useZoom'
import { addImageAsset, getAsset, referencedAssets } from '../lib/assets'
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
import { safeFileName, triggerDownload } from '../lib/docExport'
import { consumeHomeAction } from '../lib/handoff'
import { mermaidToPng } from '../lib/mermaidRenderer'
import { parseMD } from '../lib/markdown'
import { EDITOR_ONLY_KEYS, Settings } from '../lib/settings'
import { loadPersisted } from '../lib/storage'
import { applyTheme, effectiveTheme, onSystemThemeChange } from '../lib/theme'

export function EditorPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const persisted = useRef(loadPersisted())

  const [md, setMd] = useState(persisted.current.md)
  const [settings, setSettings] = useState<Settings>(persisted.current.s)
  const [split, setSplit] = useState(0.46)
  const [collapsed, setCollapsed] = useState<'none' | 'editor' | 'preview'>('none')
  const [downloading, setDownloading] = useState<false | 'docx'>(false)
  const [settingsSection, setSettingsSection] = useState<'doc' | 'ed' | null>(null)
  const [userOpen, setUserOpen] = useState(false)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  // Пользователь уже редактировал документ или запустил генерацию.
  const userTouched = useRef(false)

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

  const { pages, doPaginate, schedulePaginate } = usePagination(stateRef)

  /* ---------- сохранение (только localStorage) ---------- */

  const { scheduleSave, manualSave } = useDocPersistence({ stateRef, showToast })

  /* ---------- масштаб ---------- */

  const { setZoom, zoomValue, userZoomed, fitZoom } = useZoom(previewRef)

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
      userTouched.current = true
      setMd(v)
      schedulePaginate()
      scheduleSave()
    },
    [schedulePaginate, scheduleSave],
  )

  const onSettingChange = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      userTouched.current = true
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
      // setRangeText меняет значение нативно: позиция прокрутки и фокус
      // сохраняются (в отличие от замены value через React).
      const scrollTop = ta.scrollTop
      ta.focus()
      ta.setRangeText(text, st, ta.selectionEnd, 'end')
      ta.scrollTop = scrollTop
      onMdChange(ta.value)
    },
    [onMdChange],
  )

  /* ---------- фоновая задача ИИ ---------- */

  const { aiJob, aiActive, trackAiJob, cancelAi } = useAiJob({
    userTouched,
    taRef,
    setMd,
    onMdChange,
    schedulePaginate,
    showToast,
  })

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
        const { unzipSync } = await import('fflate')
        entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
      } catch {
        showToast('Не удалось распаковать архив')
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
      const name = (mdFile.name.split('/').pop() || 'Курсовая работа').replace(/\.(md|markdown|txt)$/i, '')
      const localRefs = findLocalRefs(text)

      // Картинки архива по нормализованному пути и по имени файла (normPath/
      // baseName приводят Unicode к NFC: macOS хранит имена в NFD).
      const imgByPath = new Map<string, string>()
      const imgByBase = new Map<string, string>()
      for (const f of files) {
        if (/\.(png|jpe?g|gif|webp)$/i.test(f.name)) {
          imgByPath.set(normPath(f.name), f.orig)
          imgByBase.set(baseName(f.name), f.orig)
        }
      }

      const keyBySrc = new Map<string, string>()
      const keyByEntry = new Map<string, string>()
      for (const src of localRefs) {
        const entry = imgByPath.get(normPath(src)) ?? imgByBase.get(baseName(src))
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
    [applyLoadedDoc, showToast],
  )

  const uploadMd = useCallback(
    async (file: File) => {
      if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
        await uploadArchive(file)
        return
      }
      let text = ''
      try {
        text = await file.text()
      } catch {
        showToast('Не удалось прочитать файл')
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

  const requireAuth = useCallback((): boolean => {
    if (user) return true
    showToast('Войдите в аккаунт, чтобы продолжить')
    window.setTimeout(() => navigate('/login'), 600)
    return false
  }, [user, navigate, showToast])

  // Действие с другой страницы: подхватить запущенную генерацию (/create)
  // или открыть загруженный на главной файл.
  useEffect(() => {
    const action = consumeHomeAction()
    if (!action) return
    if (action.kind === 'track') {
      onSettingChange('topic', action.topic)
      trackAiJob(action.jobId, 'Курсовая сгенерирована — текст в редакторе', 'generate')
    } else {
      void uploadMd(action.file)
    }
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
      if (downloading || !requireAuth()) return
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
        if (e instanceof ApiError && e.status === 401) requireAuth()
        else showToast(e instanceof Error ? e.message : 'Не удалось сформировать файл')
      } finally {
        setDownloading(false)
      }
    },
    [downloading, exportName, requireAuth, showToast],
  )

  const splitDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const move = (ev: MouseEvent) => {
      setSplit(Math.max(0.28, Math.min(0.68, ev.clientX / window.innerWidth)))
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      if (!userZoomed.current) fitZoom()
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [fitZoom])

  return (
    <div
      className="flex h-screen flex-col bg-paper text-ink antialiased"
      style={{
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif",
      }}
    >
      <Header
        downloading={downloading}
        onDownload={download}
        onUploadMd={uploadMd}
        theme={effectiveTheme(settings.theme)}
        onToggleTheme={() =>
          onSettingChange('theme', effectiveTheme(settings.theme) === 'dark' ? 'light' : 'dark')
        }
        onOpenUser={() => {
          if (user) setUserOpen(true)
          else navigate('/login')
        }}
        userName={user?.name ?? null}
      />

      <div className="flex min-h-0 flex-1">
        {collapsed === 'editor' ? (
          <div className="flex w-[40px] flex-shrink-0 flex-col items-center border-r border-line bg-surface pt-2">
            <IconButton title="Развернуть редактор" onClick={() => setCollapsed('none')}>
              <CollapseRightIcon />
            </IconButton>
          </div>
        ) : (
          <EditorPane
            md={md}
            settings={settings}
            width={collapsed === 'preview' ? '100%' : (split * 100).toFixed(1) + '%'}
            taRef={taRef}
            onChange={onMdChange}
            onSave={manualSave}
            onInsert={insertSnippet}
            onInsertImage={insertImage}
            onUploadMd={uploadMd}
            onToast={showToast}
            onOpenSettings={() => setSettingsSection('ed')}
            onCollapse={() => setCollapsed('editor')}
            bottomPanel={
              <AiConsole
                currentMd={md}
                job={aiActive ? aiJob : null}
                authed={Boolean(user)}
                onEnsureAuth={requireAuth}
                onStarted={trackAiJob}
                onCancel={cancelAi}
                onToast={showToast}
              />
            }
          />
        )}
        {collapsed === 'none' && (
          <div
            onMouseDown={splitDown}
            title="Перетащите, чтобы изменить размер"
            className="z-10 flex flex-shrink-0 cursor-col-resize items-center justify-center bg-transparent"
            style={{ width: 9, margin: '0 -4px' }}
          />
        )}
        {collapsed === 'preview' ? (
          <div className="flex w-[40px] flex-shrink-0 flex-col items-center border-l border-line pt-2" style={{ background: 'var(--preview-bar)' }}>
            <IconButton title="Развернуть превью" onClick={() => setCollapsed('none')} hoverBg="var(--hover-2)">
              <CollapseLeftIcon />
            </IconButton>
          </div>
        ) : (
          <PreviewPane
            pages={pages}
            zoom={zoomValue}
            previewRef={previewRef}
            onZoomIn={() => {
              userZoomed.current = true
              setZoom(Math.min(2, Math.round(zoomValue * 10 + 1) / 10))
            }}
            onZoomOut={() => {
              userZoomed.current = true
              setZoom(Math.max(0.3, Math.round(zoomValue * 10 - 1) / 10))
            }}
            onZoomFit={() => {
              userZoomed.current = false
              fitZoom()
            }}
            onOpenSettings={() => setSettingsSection('doc')}
            onCollapse={() => setCollapsed('preview')}
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
      {userOpen && <UserModal onClose={() => setUserOpen(false)} onToast={showToast} />}
      {toast && <Toast message={toast} />}
    </div>
  )
}
