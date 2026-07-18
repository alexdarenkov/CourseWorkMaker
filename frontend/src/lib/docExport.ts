/**
 * Экспорт документа: .zip (markdown + картинки из хранилища ассетов) и
 * скачивание блобов. Такой .zip обратно импортируется кнопкой «Загрузить»
 * без потери картинок (ссылки asset:… переписаны на относительные пути).
 */

/** Имя файла без символов, запрещённых в Windows/macOS. */
export function safeFileName(name: string): string {
  return (name || 'Курсовая работа').replace(/[\\/:*?"<>|]+/g, '_')
}

/** data-URL картинки → байты и расширение файла; null — не картинка/битый base64. */
export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; ext: string } | null {
  const dm = /^data:image\/(png|jpe?g|gif|webp);base64,([\s\S]*)$/.exec(dataUrl)
  if (!dm) return null
  try {
    const bin = atob(dm[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, ext: dm[1] === 'jpeg' ? 'jpg' : dm[1] }
  } catch {
    return null
  }
}

/** Собирает .zip: markdown с переписанными ссылками + файлы картинок в images/.
 *  assets — используемые в тексте ассеты (ключ asset:… → data-URL). */
export async function buildZipExport(
  md: string,
  docName: string,
  assets: Record<string, string>,
): Promise<{ blob: Blob; safeName: string }> {
  const { zipSync, strToU8 } = await import('fflate')
  const files: Record<string, Uint8Array> = {}
  let out = md
  for (const [key, dataUrl] of Object.entries(assets)) {
    const decoded = dataUrlToBytes(dataUrl)
    // Битый base64 — оставляем ссылку как есть.
    if (!decoded) continue
    const name = `images/${key.replace(/^asset:/, '')}.${decoded.ext}`
    files[name] = decoded.bytes
    out = out.split(key).join(name)
  }
  const safeName = safeFileName(docName)
  files[`${safeName}.md`] = strToU8(out)
  const blob = new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })
  return { blob, safeName }
}

/** Скачивание блоба файлом. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
