import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { aiApi, AiJob, convertApi, DocumentDto, documentsApi } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AiConsole, AiJobKind } from '../components/AiConsole'
import { DiffPane } from '../components/DiffPane'
import { DocsModal } from '../components/DocsModal'
import { EditorPane } from '../components/EditorPane'
import { Header } from '../components/Header'
import { LintModal } from '../components/LintModal'
import { PreviewPane } from '../components/PreviewPane'
import { CollapseLeftIcon, CollapseRightIcon } from '../components/icons'
import { IconButton } from '../components/ui'
import { SettingsModal } from '../components/SettingsModal'
import { Toast } from '../components/Toast'
import { UserModal } from '../components/UserModal'
import { addImageAsset, getAsset, importAssets, pruneAssets, referencedAssets } from '../lib/assets'
import { getMermaidSvg, mermaidToPng } from '../lib/mermaidRenderer'
import { parseMD } from '../lib/markdown'
import { Page, paginate } from '../lib/paginate'
import { EDITOR_ONLY_KEYS, migrateSettings, Settings } from '../lib/settings'
import { loadPersisted, savePersisted } from '../lib/storage'
import { applyTheme, effectiveTheme, onSystemThemeChange } from '../lib/theme'

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

/** Имена файлов в zip без флага UTF-8 fflate декодирует как latin1 — кириллица
 *  превращается в «мусор» (ÐÑ…). Если строка состоит только из байтов 0–255 и
 *  содержит верхние байты, перекодируем её обратно в UTF-8. */
function fixZipName(s: string): string {
  if (/[-ÿ]/.test(s) && ![...s].some((c) => c.charCodeAt(0) > 255)) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from([...s], (c) => c.charCodeAt(0)),
      )
    } catch {
      /* не валидный UTF-8 — оставляем как есть */
    }
  }
  return s
}

/** Служебные записи архивов macOS (AppleDouble), которые не нужно обрабатывать. */
function isMacJunk(name: string): boolean {
  return name.includes('__MACOSX/') || (name.split('/').pop() || '').startsWith('._')
}

export function EditorPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const persisted = useRef(loadPersisted())

  const [md, setMd] = useState(persisted.current.md)
  const [docName, setDocName] = useState(persisted.current.docName)
  const [settings, setSettings] = useState<Settings>(persisted.current.s)
  const [split, setSplit] = useState(0.46)
  const [collapsed, setCollapsed] = useState<'none' | 'editor' | 'preview'>('none')
  const [zoom, setZoom] = useState<number | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  // Индикатор «Сохранено» удалён вместе с футером; setSaved оставлен —
  // на нём держится дебаунс автосохранения (scheduleSave/persistNow).
  const [, setSaved] = useState(true)
  const [downloading, setDownloading] = useState<false | 'docx' | 'pdf'>(false)
  const [settingsSection, setSettingsSection] = useState<'doc' | 'ed' | null>(null)
  const [userOpen, setUserOpen] = useState(false)
  const [aiJob, setAiJob] = useState<AiJob | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [docsOpen, setDocsOpen] = useState(false)
  const [lintBusy, setLintBusy] = useState(false)
  // Последний результат нормоконтроля (бейдж в статус-баре) и открыт ли список.
  const [lintResult, setLintResult] = useState<string[] | null>(null)
  const [lintOpen, setLintOpen] = useState(false)
  // История ИИ-изменений ТЕКУЩЕГО отчёта (не переживает смену документа —
  // раньше persist-снапшот «протекал» между отчётами): before — текст до
  // правки, after — после, at — на какой версии стоит редактор.
  const [aiHist, setAiHist] = useState<{ before: string; after: string; at: 'before' | 'after' } | null>(null)
  // Готовая ИИ-правка, ожидающая решения пользователя в diff-просмотре.
  const [pendingAi, setPendingAi] = useState<{
    oldMd: string
    markdown: string
    assets?: Record<string, string>
  } | null>(null)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const userZoomed = useRef(false)
  const paginateTimer = useRef<number | null>(null)
  const saveTimer = useRef<number | null>(null)
  const remoteTimer = useRef<number | null>(null)
  const toastTimer = useRef<number | null>(null)
  const docIdRef = useRef<string | null>(null)
  // Пользователь уже редактировал документ/настройки или запустил генерацию —
  // запоздавшая загрузка из облака не должна затирать его правки.
  const userTouched = useRef(false)

  // Актуальные значения для отложенных колбэков.
  const stateRef = useRef({ md, docName, settings })
  stateRef.current = { md, docName, settings }

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
    // Логотип и свой титульник живут вне markdown — уборка их не трогает.
    pruneAssets(m, [s.titleLogo, s.titleCustom])
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
          // Если пользователь уже начал работать (правки/генерация), не затираем
          // его локальное состояние — сохранение позже зальёт его в этот же doc.
          if (userTouched.current) return
          setDocName(doc.name)
          setMd(doc.content)
          try {
            setSettings((prev) => ({ ...prev, ...migrateSettings(JSON.parse(doc.settings)) }))
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
    (jobId: string, successMsg: string, kind: AiJobKind) => {
      userTouched.current = true
      stopAiPolling()
      aiJobIdRef.current = jobId
      // Текст до генерации: при живом стриминге partial пишется прямо в
      // редактор, поэтому снапшот для отката снимается с исходного текста
      // при ПЕРВОМ же чанке (а не в конце).
      const preMd = stateRef.current.md
      let streamed = false
      let lastPartial = ''
      setAiJob({ id: jobId, status: 'queued', stage: 'В очереди', progress: 0, markdown: null, error: null })
      aiPollRef.current = window.setInterval(async () => {
        try {
          const j = await aiApi.job(jobId)
          setAiJob(j)
          // Живой стриминг генерации: растущий partial (готовые разделы +
          // «печатающийся» черновик текущего) показывается прямо в редакторе
          // и превью; по завершении заменится финальной версией.
          if (
            kind === 'generate' &&
            (j.status === 'running' || j.status === 'queued') &&
            j.partial &&
            j.partial !== lastPartial
          ) {
            lastPartial = j.partial
            streamed = true
            setMd(j.partial)
            schedulePaginate()
            // Автопрокрутка редактора к «печатающейся» строке.
            const ta = taRef.current
            if (ta) requestAnimationFrame(() => (ta.scrollTop = ta.scrollHeight))
          }
          if (j.status === 'done' || j.status === 'error' || j.status === 'cancelled') {
            stopAiPolling()
            aiJobIdRef.current = null
            if (j.status === 'done' && j.markdown) {
              if (kind === 'edit') {
                // Правка не применяется сразу: пользователь смотрит diff и
                // решает — принять или отклонить.
                setPendingAi({ oldMd: stateRef.current.md, markdown: j.markdown, assets: j.assets })
                setAiJob(null)
              } else {
                // Сначала кладём сгенерированные графики в хранилище, потом
                // текст, чтобы превью сразу нашло картинки asset:fig-N.
                importAssets(j.assets)
                onMdChange(j.markdown)
                setAiHist({ before: preMd, after: j.markdown, at: 'after' })
                showToast(successMsg)
                setAiJob(null)
              }
            } else if (j.status === 'cancelled') {
              if (kind === 'generate' && j.partial?.trim()) {
                if (streamed) {
                  // Частичный текст уже в редакторе — фиксируем его; исходный
                  // текст возвращается стрелкой «назад» в шапке.
                  onMdChange(j.partial)
                  setAiHist({ before: preMd, after: j.partial, at: 'after' })
                  showToast('Генерация остановлена — исходный текст вернёт стрелка «назад» в шапке')
                } else {
                  // Уже написанные разделы не пропадают: пользователь видит их
                  // в diff-просмотре и решает, забирать ли в редактор.
                  setPendingAi({ oldMd: preMd, markdown: j.partial })
                  showToast('Генерация остановлена — можно принять уже написанные разделы')
                }
              } else {
                showToast('Задача ИИ остановлена')
              }
              setAiJob(null)
            } else if (j.status === 'error') {
              showToast('Ошибка ИИ: ' + (j.error ?? 'неизвестная'))
            }
          }
        } catch {
          /* временная ошибка опроса — продолжаем */
        }
      }, 700)
    },
    [onMdChange, schedulePaginate, showToast, stopAiPolling],
  )

  // Diff-просмотр выключен в настройках — ИИ-правка применяется сразу.
  useEffect(() => {
    if (pendingAi && !settings.showDiff) applyPendingAi()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAi, settings.showDiff])

  const applyPendingAi = useCallback(() => {
    if (!pendingAi) return
    importAssets(pendingAi.assets)
    onMdChange(pendingAi.markdown)
    setAiHist({ before: pendingAi.oldMd, after: pendingAi.markdown, at: 'after' })
    setPendingAi(null)
    showToast('Правка применена — откат стрелкой «назад» в шапке')
  }, [pendingAi, onMdChange, showToast])

  const rejectPendingAi = useCallback(() => {
    setPendingAi(null)
    showToast('Правка отклонена — текст не изменён')
  }, [showToast])

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

  // Локальные ссылки на картинки (не http/data/asset/placeholder).
  const isResolvable = (s: string) => /^(https?:\/\/|data:|asset:|placeholder)/i.test(s)
  const findLocalRefs = (text: string) =>
    [
      ...new Set(
        [...text.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g)]
          .map((m) => m[1])
          .filter((s) => !isResolvable(s)),
      ),
    ]

  // Применяет загруженный документ: переписывает локальные ссылки на asset-ключи
  // из keyBySrc, грузит текст и кладёт картинки в хранилище.
  const applyLoadedDoc = useCallback(
    (text: string, name: string, keyBySrc: Map<string, string>, localCount: number) => {
      let linked = 0
      const out = text.replace(/(!\[[^\]]*\]\(\s*)([^)\s]+)([^)]*\))/g, (full, pre, src, post) => {
        if (isResolvable(src)) return full
        const key = keyBySrc.get(src)
        if (key) {
          linked++
          return pre + key + post
        }
        return full
      })
      setDocName(name)
      onMdChange(out)
      const left = localCount - linked
      if (localCount === 0) showToast('Документ загружен')
      else showToast(`Документ загружен · картинок подставлено: ${linked}, заглушек: ${left}`)
    },
    [onMdChange, showToast],
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
      const mdFile = files
        .filter((f) => /\.(md|markdown|txt)$/i.test(f.name))
        .sort((a, b) => a.name.split('/').length - b.name.split('/').length || a.name.length - b.name.length)[0]
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

      // Картинки архива по нормализованному пути и по имени файла. Нормализуем
      // Unicode в NFC: macOS хранит имена в NFD, а текст обычно в NFC.
      const norm = (p: string) => p.replace(/^\.?\//, '').toLowerCase().normalize('NFC')
      const baseOf = (p: string) => (p.split(/[\\/]/).pop() || '').toLowerCase().normalize('NFC')
      const imgByPath = new Map<string, string>()
      const imgByBase = new Map<string, string>()
      for (const f of files) {
        if (/\.(png|jpe?g|gif|webp)$/i.test(f.name)) {
          imgByPath.set(norm(f.name), f.orig)
          imgByBase.set(baseOf(f.name), f.orig)
        }
      }
      const mime = (n: string) =>
        /\.png$/i.test(n) ? 'image/png' : /\.gif$/i.test(n) ? 'image/gif' : /\.webp$/i.test(n) ? 'image/webp' : 'image/jpeg'

      const keyBySrc = new Map<string, string>()
      const keyByEntry = new Map<string, string>()
      for (const src of localRefs) {
        const entry = imgByPath.get(norm(src)) ?? imgByBase.get(baseOf(src))
        if (!entry) continue
        try {
          if (!keyByEntry.has(entry)) {
            const f = new File([entries[entry] as BlobPart], baseOf(fixZipName(entry)) || 'image', {
              type: mime(entry),
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

  /* ---------- откат ИИ-правки ---------- */

  // Меняет местами текущий текст и снапшот: повторное нажатие возвращает
  // ИИ-версию, так что случайный клик ничего не теряет.
  // Назад/вперёд между версиями «до ИИ-правки» и «после» — в рамках
  // ТЕКУЩЕГО отчёта (история сбрасывается при смене документа).
  const aiBack = useCallback(() => {
    if (!aiHist || aiHist.at !== 'after') return
    onMdChange(aiHist.before)
    setAiHist({ ...aiHist, at: 'before' })
    showToast('Возвращён текст до ИИ-изменения — стрелка «вперёд» вернёт результат')
  }, [aiHist, onMdChange, showToast])

  const aiForward = useCallback(() => {
    if (!aiHist || aiHist.at !== 'before') return
    onMdChange(aiHist.after)
    setAiHist({ ...aiHist, at: 'after' })
    showToast('Возвращён результат ИИ')
  }, [aiHist, onMdChange, showToast])

  /* ---------- нормоконтроль ---------- */

  const runLint = useCallback(async () => {
    if (lintBusy || !requireAuth()) return
    setLintBusy(true)
    try {
      const { issues } = await aiApi.lint(stateRef.current.md)
      setLintResult(issues)
      if (issues.length === 0) showToast('Нормоконтроль пройден — замечаний нет')
      else setLintOpen(true)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось выполнить проверку')
    } finally {
      setLintBusy(false)
    }
  }, [lintBusy, requireAuth, showToast])

  /* ---------- экспорт .zip (markdown + картинки) ---------- */

  const exportZip = useCallback(async () => {
    const { md: m, docName: n } = stateRef.current
    const { zipSync, strToU8 } = await import('fflate')
    const files: Record<string, Uint8Array> = {}
    // Ассеты из localStorage кладём в архив файлами, а ссылки в копии markdown
    // переписываем на относительные пути — такой .zip обратно импортируется
    // кнопкой «Загрузить» без потери картинок.
    let out = m
    for (const [key, dataUrl] of Object.entries(referencedAssets(m))) {
      const dm = /^data:image\/(png|jpe?g|gif|webp);base64,([\s\S]*)$/.exec(dataUrl)
      if (!dm) continue
      try {
        const bin = atob(dm[2])
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const name = `images/${key.replace(/^asset:/, '')}.${dm[1] === 'jpeg' ? 'jpg' : dm[1]}`
        files[name] = bytes
        out = out.split(key).join(name)
      } catch {
        /* битый base64 — оставляем ссылку как есть */
      }
    }
    const safeName = (n || 'Курсовая работа').replace(/[\\/:*?"<>|]+/g, '_')
    files[`${safeName}.md`] = strToU8(out)
    const blob = new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName}.zip`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Архив сохранён: markdown + картинки')
  }, [showToast])

  const exportMd = useCallback(() => {
    const { md: m, docName: n } = stateRef.current
    const safeName = (n || 'Курсовая работа').replace(/[\\/:*?"<>|]+/g, '_')
    const blob = new Blob([m], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName}.md`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Файл .md сохранён (картинки не входят — для них есть архив .zip)')
  }, [showToast])

  /* ---------- несколько документов ---------- */

  // Досылает несохранённый хвост правок текущего документа перед переключением.
  const flushRemoteSave = useCallback(async () => {
    if (remoteTimer.current) {
      window.clearTimeout(remoteTimer.current)
      remoteTimer.current = null
    }
    if (user && docIdRef.current) {
      const { md: m, docName: n, settings: s } = stateRef.current
      try {
        await documentsApi.update(docIdRef.current, n || 'Курсовая работа', m, JSON.stringify(s))
      } catch {
        /* документ мог быть удалён — не блокируем переключение */
      }
    }
  }, [user])

  const openDoc = useCallback(
    async (doc: DocumentDto) => {
      await flushRemoteSave()
      userTouched.current = true
      docIdRef.current = doc.id
      // История ИИ-правок и отложенный diff принадлежат прошлому документу.
      setAiHist(null)
      setPendingAi(null)
      setDocName(doc.name)
      setMd(doc.content)
      try {
        setSettings((prev) => ({ ...prev, ...migrateSettings(JSON.parse(doc.settings)) }))
      } catch {
        /* settings повреждены — оставляем текущие */
      }
      schedulePaginate()
      scheduleSave()
      showToast(`Открыт документ «${doc.name}»`)
    },
    [flushRemoteSave, schedulePaginate, scheduleSave, showToast],
  )

  const createDoc = useCallback(async () => {
    await flushRemoteSave()
    userTouched.current = true
    try {
      const { settings: s } = stateRef.current
      const doc = await documentsApi.create('Новая работа', '', JSON.stringify(s))
      docIdRef.current = doc.id
      setAiHist(null)
      setPendingAi(null)
      setDocName(doc.name)
      setMd('')
      schedulePaginate()
      scheduleSave()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось создать документ')
    }
  }, [flushRemoteSave, schedulePaginate, scheduleSave, showToast])

  const onDocDeleted = useCallback(
    (id: string) => {
      if (docIdRef.current !== id) return
      // Удалили открытый документ: текст остаётся локально, а облачная копия
      // пересоздаётся, чтобы автосохранение продолжило работать.
      docIdRef.current = null
      const { md: m, docName: n, settings: s } = stateRef.current
      documentsApi
        .create(n || 'Курсовая работа', m, JSON.stringify(s))
        .then((doc) => {
          docIdRef.current = doc.id
        })
        .catch(() => {})
    },
    [],
  )

  const download = useCallback(
    async (format: 'docx' | 'pdf') => {
      if (downloading || !requireAuth()) return
      setDownloading(format)
      try {
        const { md: m, docName: n, settings: s } = stateRef.current
        const assets: Record<string, string> = referencedAssets(m)
        // Логотип и свой титульник — ассеты вне markdown, конвертеру нужны явно.
        for (const key of [s.titleLogo, s.titleCustom]) {
          if (key?.startsWith('asset:')) {
            const value = getAsset(key)
            if (value) assets[key] = value
          }
        }
        const mermaidBlocks = parseMD(m).filter((b) => b.type === 'mermaid')
        await Promise.all(
          mermaidBlocks.map(async (b, i) => {
            if (b.type !== 'mermaid') return
            const png = await mermaidToPng(b.code)
            if (png) assets[`mermaid-${i}`] = png
          }),
        )
        // Серверная конвертация (Pandoc-формулы; PDF дорендеривает LibreOffice).
        const name = n || 'Курсовая работа'
        const blob =
          format === 'pdf'
            ? await convertApi.pdf(m, name, s, assets)
            : await convertApi.docx(m, name, s, assets)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${name}.${format}`
        a.click()
        URL.revokeObjectURL(url)
        showToast(`Файл «${name}.${format}» скачан`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) requireAuth()
        else showToast(e instanceof Error ? e.message : 'Не удалось сформировать файл')
      } finally {
        setDownloading(false)
      }
    },
    [downloading, requireAuth, showToast],
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

  const zoomValue = zoom ?? 0.8

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
          userTouched.current = true
          setDocName(v)
          scheduleSave()
        }}
        downloading={downloading}
        onDownload={download}
        onExportZip={exportZip}
        onExportMd={exportMd}
        onOpenDocs={() => {
          if (requireAuth()) setDocsOpen(true)
        }}
        lintBusy={lintBusy}
        lintCount={lintResult === null ? null : lintResult.length}
        onLint={runLint}
        canBack={aiHist?.at === 'after'}
        canForward={aiHist?.at === 'before'}
        onBack={aiBack}
        onForward={aiForward}
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
        ) : pendingAi && settings.showDiff ? (
          <DiffPane
            width={collapsed === 'preview' ? '100%' : (split * 100).toFixed(1) + '%'}
            oldText={pendingAi.oldMd}
            newText={pendingAi.markdown}
            onApply={applyPendingAi}
            onReject={rejectPendingAi}
          />
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
      {docsOpen && (
        <DocsModal
          currentId={docIdRef.current}
          onOpen={openDoc}
          onCreate={createDoc}
          onDeleted={onDocDeleted}
          onClose={() => setDocsOpen(false)}
          onToast={showToast}
        />
      )}
      {lintOpen && lintResult && (
        <LintModal issues={lintResult} onClose={() => setLintOpen(false)} />
      )}
      {toast && <Toast message={toast} />}
    </div>
  )
}
