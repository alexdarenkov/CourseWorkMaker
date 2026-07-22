/** Скачивание файлов на устройство (экспорт — только .docx, AI-10). */

/** Имя файла без символов, запрещённых в Windows/macOS. */
export function safeFileName(name: string): string {
  return (name || 'Курсовая работа').replace(/[\\/:*?"<>|]+/g, '_')
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
