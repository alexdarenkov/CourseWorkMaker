/**
 * Сохранение документа: ТОЛЬКО localStorage (дебаунс 700 мс). Облачного CRUD
 * нет — перенос между устройствами делается экспортом/импортом .zip
 * (markdown + картинки), см. docExport.ts/docImport.ts.
 */
import { useCallback, useRef } from 'react'
import { pruneAssets } from '../lib/assets'
import { Settings } from '../lib/settings'
import { savePersisted } from '../lib/storage'

interface UseDocPersistenceDeps {
  stateRef: { current: { md: string; settings: Settings } }
  showToast: (msg: string) => void
}

export function useDocPersistence({ stateRef, showToast }: UseDocPersistenceDeps) {
  const saveTimer = useRef<number | null>(null)

  const persistNow = useCallback(() => {
    const { md: m, settings: s } = stateRef.current
    savePersisted({ md: m, s })
    // Логотип титульника живёт вне markdown — уборка его не трогает.
    pruneAssets(m, [s.titleLogo])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(persistNow, 700)
  }, [persistNow])

  const manualSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    persistNow()
    showToast('Документ сохранён')
  }, [persistNow, showToast])

  return { persistNow, scheduleSave, manualSave }
}
