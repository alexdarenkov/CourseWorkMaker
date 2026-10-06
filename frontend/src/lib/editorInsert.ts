/** Вставка через браузерный undo-стек; setRangeText сам историю не записывает. */
export function replaceEditorSelection(ta: HTMLTextAreaElement, text: string): void {
  const top = ta.scrollTop
  const left = ta.scrollLeft
  ta.focus()
  // У textarea нет современного аналога insertText с записью в native Undo.
  // execCommand остаётся доступен в целевом Chrome; fallback нужен для других
  // движков и тестового DOM, но там сохранение Undo не гарантируется.
  if (!document.execCommand?.('insertText', false, text)) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end')
  }
  ta.scrollTop = top
  ta.scrollLeft = left
}
