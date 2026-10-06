/** Автосохранение с контролем ошибок и записью при уходе из редактора. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings } from '../lib/settings'
import { hasUnsavedDraft, savePersisted } from '../lib/storage'

interface UseDocPersistenceDeps {
  stateRef: { current: { md: string; settings: Settings } }
  showToast: (msg: string) => void
}

export function useDocPersistence({ stateRef, showToast }: UseDocPersistenceDeps) {
  const saveTimer = useRef<number | null>(null)
  const dirty = useRef(hasUnsavedDraft())
  const [saveStatus, setSaveStatus] = useState(() => hasUnsavedDraft() ? 'Не сохранено' : 'Сохранено в этом браузере')
  const toastRef = useRef(showToast)
  toastRef.current = showToast

  const persistNow = useCallback(() => {
    const { md, settings } = stateRef.current
    const saved = savePersisted({ md, s: settings })
    dirty.current = !saved
    setSaveStatus(saved ? 'Сохранено в этом браузере' : 'Не сохранено')
    if (!saved) toastRef.current('Не удалось сохранить изменения. Не закрывайте вкладку и повторите сохранение.')
    // Ассеты сохраняются при добавлении. Автоочистка запрещена: ссылки может вернуть Undo.
    return saved
  }, [stateRef])

  const scheduleSave = useCallback(() => {
    dirty.current = true
    setSaveStatus('Сохраняем…')
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(persistNow, 700)
  }, [persistNow])

  const manualSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    if (persistNow()) toastRef.current('Документ сохранён')
  }, [persistNow])

  useEffect(() => {
    const flush = () => {
      if (dirty.current) {
        const { md, settings } = stateRef.current
        dirty.current = !savePersisted({ md, s: settings })
      }
    }
    const beforeUnload = (e: BeforeUnloadEvent) => {
      flush()
      if (dirty.current) { e.preventDefault(); e.returnValue = '' }
    }
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      flush()
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [stateRef])

  return { persistNow, scheduleSave, manualSave, saveStatus }
}
