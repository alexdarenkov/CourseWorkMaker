/**
 * Сохранение документа: localStorage (дебаунс 700 мс), облако (дебаунс 1.5 с,
 * только при входе и известном docId) и синхронизация после входа.
 * Гонка: запоздавшая загрузка из облака не должна затирать правки пользователя —
 * эффект пропускает перезапись, если userTouched уже true.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { documentsApi } from '../api'
import { pruneAssets } from '../lib/assets'
import { migrateSettings, Settings, User } from '../lib/settings'
import { savePersisted } from '../lib/storage'

interface UseDocPersistenceDeps {
  user: User | null
  stateRef: { current: { md: string; docName: string; settings: Settings } }
  userTouched: { current: boolean }
  setMd: (v: string) => void
  setDocName: (v: string) => void
  setSettings: (updater: (prev: Settings) => Settings) => void
  schedulePaginate: () => void
  showToast: (msg: string) => void
}

export function useDocPersistence({
  user,
  stateRef,
  userTouched,
  setMd,
  setDocName,
  setSettings,
  schedulePaginate,
  showToast,
}: UseDocPersistenceDeps) {
  // Индикатор «Сохранено» удалён вместе с футером; setSaved оставлен —
  // на нём держится дебаунс автосохранения (scheduleSave/persistNow).
  const [, setSaved] = useState(true)
  const saveTimer = useRef<number | null>(null)
  const remoteTimer = useRef<number | null>(null)
  const docIdRef = useRef<string | null>(null)

  const persistNow = useCallback(() => {
    const { md: m, docName: n, settings: s } = stateRef.current
    savePersisted({ md: m, docName: n, s })
    // Логотип титульника живёт вне markdown — уборка его не трогает.
    pruneAssets(m, [s.titleLogo])
    setSaved(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, schedulePaginate, showToast])

  const manualSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    persistNow()
    showToast('Документ сохранён')
  }, [persistNow, showToast])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  return { docIdRef, persistNow, scheduleSave, manualSave, flushRemoteSave }
}
