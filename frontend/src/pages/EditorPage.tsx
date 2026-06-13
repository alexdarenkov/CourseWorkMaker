import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { aiApi, AiJob, convertApi, documentsApi } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AiModal } from '../components/AiModal'
import { EditorPane } from '../components/EditorPane'
import { Header } from '../components/Header'
import { PreviewPane } from '../components/PreviewPane'
import { SettingsModal } from '../components/SettingsModal'
import { StatusBar } from '../components/StatusBar'
import { Toast } from '../components/Toast'
import { UserModal } from '../components/UserModal'
import { addImageAsset, importAssets, pruneAssets, referencedAssets } from '../lib/assets'
import { getMermaidSvg, mermaidToPng } from '../lib/mermaidRenderer'
import { parseMD } from '../lib/markdown'
import { Page, paginate } from '../lib/paginate'
import { EDITOR_ONLY_KEYS, Settings } from '../lib/settings'
import { loadPersisted, savePersisted } from '../lib/storage'
import { applyTheme } from '../lib/theme'

const PAGE_WIDTH_PX = 794

/** Открывает системный диалог выбора файлов; [] при отмене. */
function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    let settled = false
    const finish = (files: File[]) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onFocus)
      resolve(files)
    }
    input.onchange = () => finish(Array.from(input.files ?? []))
    // Отмена диалога не вызывает onchange — ловим возврат фокуса на окно.
    const onFocus = () => window.setTimeout(() => finish([]), 400)
    window.addEventListener('focus', onFocus, { once: true })
    input.click()
  })
}

export function EditorPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const persisted = useRef(loadPersisted())

  const [md, setMd] = useState(persisted.current.md)
  const [docName, setDocName] = useState(persisted.current.docName)
  const [settings, setSettings] = useState<Settings>(persisted.current.s)
  const [split, setSplit] = useState(0.46)
  const [zoom, setZoom] = useState<number | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [saved, setSaved] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [settingsSection, setSettingsSection] = useState<'doc' | 'ed' | null>(null)
  const [userOpen, setUserOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiJob, setAiJob] = useState<AiJob | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const userZoomed = useRef(false)
  const paginateTimer = useRef<number | null>(null)
  const saveTimer = useRef<number | null>(null)
  const remoteTimer = useRef<number | null>(null)
  const toastTimer = useRef<number | null>(null)
  const docIdRef = useRef<string | null>(null)

  // Актуальные значения для отложенных колбэков.
  const stateRef = useRef({ md, docName, settings })
  stateRef.current = { md, docName, settings }

  useEffect(() => applyTheme(settings.theme), [settings.theme])

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }, [])

  /* ---------- пагинация ---------- */

  const doPaginate = useCallback(() => {
    const { md: m, settings: s } = stateRef.current
    setPages(
      paginate(
        m,
        s,
        (code) => getMermaidSvg(code, () => schedulePaginate()),
        () => schedulePaginate(),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const schedulePaginate = useCallback(() => {
    if (paginateTimer.current) window.clearTimeout(paginateTimer.current)
    paginateTimer.current = window.setTimeout(doPaginate, 180)
  }, [doPaginate])

  /* ---------- сохранение ---------- */

  const persistNow = useCallback(() => {
    const { md: m, docName: n, settings: s } = stateRef.current
    savePersisted({ md: m, docName: n, s })
    pruneAssets(m)
    setSaved(true)
  }, [])

  const scheduleSave = useCallback(() => {
    setSaved(false)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(persistNow, 700)
    if (user && docIdRef.current) {
      if (remoteTimer.current) window.clearTimeout(remoteTimer.current)
      remoteTimer.current = window.setTimeout(() => {
        const { md: m, docName: n, settings: s } = stateRef.current
        documentsApi
          .update(docIdRef.current!, n || 'Курсовая работа', m, JSON.stringify(s))
          .catch(() => {})
      }, 1500)
    }
  }, [persistNow, user])

  /* ---------- синхронизация с сервером после входа ---------- */

  useEffect(() => {
    if (!user) {
      docIdRef.current = null
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const list = await documentsApi.list()
        if (cancelled) return
        if (list.length > 0) {
          const doc = await documentsApi.get(list[0].id)
          if (cancelled) return
          docIdRef.current = doc.id
          setDocName(doc.name)
          setMd(doc.content)
          try {
            setSettings((prev) => ({ ...prev, ...JSON.parse(doc.settings) }))
          } catch {
            /* settings повреждены — оставляем локальные */
          }
          schedulePaginate()
          showToast('Документ загружен из облака')
        } else {
          const { md: m, docName: n, settings: s } = stateRef.current
          const doc = await documentsApi.create(n || 'Курсовая работа', m, JSON.stringify(s))
          if (!cancelled) docIdRef.current = doc.id
        }
      } catch {
        /* документы недоступны — работаем локально */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, schedulePaginate, showToast])

  /* ---------- масштаб ---------- */

  const fitZoom = useCallback(() => {
    const el = previewRef.current
    if (!el) return
    const z = Math.max(0.3, Math.min(1.5, (el.clientWidth - 64) / PAGE_WIDTH_PX))
    setZoom(Math.round(z * 100) / 100)
  }, [])

  useEffect(() => {
    doPaginate()
    requestAnimationFrame(fitZoom)
    const onResize = () => {
      if (!userZoomed.current) fitZoom()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [doPaginate, fitZoom])

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

  const aiPollRef = useRef<number | null>(null)
  const aiJobIdRef = useRef<string | null>(null)
  const aiActive = aiJob?.status === 'queued' || aiJob?.status === 'running'

  const stopAiPolling = useCallback(() => {
    if (aiPollRef.current) window.clearInterval(aiPollRef.current)
    aiPollRef.current = null
  }, [])

  useEffect(() => stopAiPolling, [stopAiPolling])

  // Предупреждение браузера при закрытии вкладки, пока идёт задача ИИ.
  useEffect(() => {
    if (!aiActive) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [aiActive])

  const trackAiJob = useCallback(
    (jobId: string, successMsg: string) => {
      stopAiPolling()
      aiJobIdRef.current = jobId
      setAiJob({ id: jobId, status: 'queued', stage: 'В очереди', progress: 0, markdown: null, error: null })
      aiPollRef.current = window.setInterval(async () => {
        try {
          const j = await aiApi.job(jobId)
          setAiJob(j)
          if (j.status === 'done' || j.status === 'error' || j.status === 'cancelled') {
            stopAiPolling()
            aiJobIdRef.current = null
            if (j.status === 'done' && j.markdown) {
              // Сначала кладём сгенерированные графики в хранилище, потом текст,
              // чтобы превью сразу нашло картинки по ссылкам asset:fig-N.
              importAssets(j.assets)
              onMdChange(j.markdown)
              showToast(successMsg)
              setAiJob(null)
              setAiOpen(false)
            } else if (j.status === 'cancelled') {
              showToast('Задача ИИ остановлена')
              setAiJob(null)
            } else if (j.status === 'error') {
              showToast('Ошибка ИИ: ' + (j.error ?? 'неизвестная'))
            }
          }
        } catch {
          /* временная ошибка опроса — продолжаем */
        }
      }, 1500)
    },
    [onMdChange, showToast, stopAiPolling],
  )

  const cancelAi = useCallback(async () => {
    const id = aiJobIdRef.current
    if (!id) return
    try {
      await aiApi.cancel(id)
    } catch {
      /* задача могла уже завершиться */
    }
  }, [])

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

  const uploadMd = useCallback(
    async (file: File) => {
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

      // Картинки в загруженном .md: http(s)/data/asset работают как есть;
      // ссылки на локальные файлы у нас отсутствуют — предлагаем приложить их.
      const refs = [...text.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g)].map((m) => m[1])
      const isResolvable = (s: string) => /^(https?:\/\/|data:|asset:|placeholder)/i.test(s)
      const localRefs = [...new Set(refs.filter((s) => !isResolvable(s)))]

      let linked = 0
      if (localRefs.length > 0) {
        const attach = window.confirm(
          `В файле ${localRefs.length} изображений со ссылками на локальные файлы.\n` +
            'Приложить их с устройства? (без этого они станут заглушками «Место для изображения»)',
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
          }
          text = text.replace(/(!\[[^\]]*\]\(\s*)([^)\s]+)([^)]*\))/g, (full, pre, src, post) => {
            if (isResolvable(src)) return full
            const base = src.split(/[\\/]/).pop()?.toLowerCase() ?? ''
            const key = keyByBase.get(base)
            if (key) {
              linked++
              return pre + key + post
            }
            return full
          })
        }
      }

      setDocName(name)
      onMdChange(text)
      const left = localRefs.length - linked
      if (localRefs.length === 0) showToast('Документ загружен')
      else showToast(`Документ загружен · картинок подставлено: ${linked}, заглушек: ${left}`)
    },
    [onMdChange, showToast],
  )

  const manualSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    persistNow()
    showToast('Документ сохранён')
  }, [persistNow, showToast])

  const requireAuth = useCallback((): boolean => {
    if (user) return true
    showToast('Войдите в аккаунт, чтобы продолжить')
    window.setTimeout(() => navigate('/login'), 600)
    return false
  }, [user, navigate, showToast])

  const download = useCallback(async () => {
    if (downloading || !requireAuth()) return
    setDownloading(true)
    try {
      const { md: m, docName: n, settings: s } = stateRef.current
      const assets: Record<string, string> = referencedAssets(m)
      const mermaidBlocks = parseMD(m).filter((b) => b.type === 'mermaid')
      await Promise.all(
        mermaidBlocks.map(async (b, i) => {
          if (b.type !== 'mermaid') return
          const png = await mermaidToPng(b.code)
          if (png) assets[`mermaid-${i}`] = png
        }),
      )
      const blob = await convertApi.docx(m, n || 'Курсовая работа', s, assets)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${n || 'Курсовая работа'}.docx`
      a.click()
      URL.revokeObjectURL(url)
      showToast(`Файл «${n}.docx» скачан`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) requireAuth()
      else showToast(e instanceof Error ? e.message : 'Не удалось сформировать DOCX')
    } finally {
      setDownloading(false)
    }
  }, [downloading, requireAuth, showToast])

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

  const zoomValue = zoom ?? 0.8
  const wordCount = useMemo(() => (md.trim() ? md.trim().split(/\s+/).length : 0), [md])

  return (
    <div
      className="flex h-screen flex-col bg-paper text-ink antialiased"
      style={{
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif",
      }}
    >
      <Header
        docName={docName}
        onDocName={(v) => {
          setDocName(v)
          scheduleSave()
        }}
        downloading={downloading}
        onDownload={download}
        onOpenAi={() => {
          if (requireAuth()) setAiOpen(true)
        }}
        aiJob={aiActive ? aiJob : null}
        theme={settings.theme}
        onToggleTheme={() =>
          onSettingChange('theme', settings.theme === 'dark' ? 'light' : 'dark')
        }
        onOpenUser={() => {
          if (user) setUserOpen(true)
          else navigate('/login')
        }}
        userName={user?.name ?? null}
      />

      <div className="flex min-h-0 flex-1">
        <EditorPane
          md={md}
          settings={settings}
          width={(split * 100).toFixed(1) + '%'}
          taRef={taRef}
          onChange={onMdChange}
          onSave={manualSave}
          onInsert={insertSnippet}
          onInsertImage={insertImage}
          onUploadMd={uploadMd}
          onOpenSettings={() => setSettingsSection('ed')}
        />
        <div
          onMouseDown={splitDown}
          title="Перетащите, чтобы изменить размер"
          className="z-10 flex flex-shrink-0 cursor-col-resize items-center justify-center bg-transparent"
          style={{ width: 9, margin: '0 -4px' }}
        />
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
        />
      </div>

      <StatusBar saved={saved} wordCount={wordCount} pageCount={pages.length} />

      {settingsSection && (
        <SettingsModal
          settings={settings}
          section={settingsSection}
          onChange={onSettingChange}
          onClose={() => setSettingsSection(null)}
        />
      )}
      {userOpen && <UserModal onClose={() => setUserOpen(false)} onToast={showToast} />}
      {aiOpen && (
        <AiModal
          defaultTopic={settings.topic}
          currentMd={md}
          settings={settings}
          onSettingChange={onSettingChange}
          job={aiJob}
          onStarted={trackAiJob}
          onCancel={cancelAi}
          onClose={() => {
            setAiOpen(false)
            if (aiActive) showToast('Задача ИИ продолжается в фоне — прогресс виден в шапке')
          }}
          onToast={showToast}
        />
      )}
      {toast && <Toast message={toast} />}
    </div>
  )
}
