import { imageSources, rewriteImageReferences } from './imageReferences'

/**
 * Чистая логика импорта документов (.md / .zip): починка кириллицы в именах
 * архива, отсев служебных файлов macOS, поиск локальных ссылок на картинки
 * и их перепривязка к asset-ключам. Обработчики с confirm/тостами остаются
 * в EditorPage — здесь только то, что можно проверить юнит-тестами.
 */

/** Открывает системный диалог выбора файлов; [] при отмене. */
export function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
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
export function fixZipName(s: string): string {
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
export function isMacJunk(name: string): boolean {
  return name.includes('__MACOSX/') || (name.split('/').pop() || '').startsWith('._')
}

/** Ссылка, которую превью/конвертер резолвят сами (не локальный файл). */
export const isResolvable = (s: string) => /^(https?:\/\/|data:|asset:|placeholder)/i.test(s)

/** Локальные ссылки на картинки в markdown (не http/data/asset/placeholder), без дублей. */
export const findLocalRefs = (text: string) => imageSources(text).filter(src => !isResolvable(src))

/** linked — число уникальных найденных ссылок, как в findLocalRefs. */
export function relinkLocalRefs(text: string, keyBySrc: Map<string, string>) {
  const local = new Map([...keyBySrc].filter(([src]) => !isResolvable(src)))
  return rewriteImageReferences(text, local)
}

/** markdown-файл архива: корневой (минимальная глубина пути), затем кратчайший. */
export function pickMainMdEntry<T extends { name: string }>(files: T[]): T | undefined {
  return files
    .filter((f) => /\.(md|markdown|txt)$/i.test(f.name))
    .sort(
      (a, b) => a.name.split('/').length - b.name.split('/').length || a.name.length - b.name.length,
    )[0]
}

/** Нормализация пути для сопоставления картинок архива: без ./, без регистра,
 *  Unicode в NFC (macOS хранит имена в NFD, а текст обычно в NFC). */
export function normPath(p: string): string {
  const parts: string[] = []
  for (const part of p.replace(/\\/g, '/').toLowerCase().normalize('NFC').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

/** Имя файла без каталогов, в том же нормализованном виде. */
export const baseName = (p: string) => (p.split(/[\\/]/).pop() || '').toLowerCase().normalize('NFC')

/** MIME по расширению картинки (фолбэк — jpeg). */
export const mimeOf = (n: string) =>
  /\.png$/i.test(n) ? 'image/png' : /\.gif$/i.test(n) ? 'image/gif' : /\.webp$/i.test(n) ? 'image/webp' : 'image/jpeg'
