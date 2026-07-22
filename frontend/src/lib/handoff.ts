/**
 * Передача действия между страницами в редактор. File нельзя надёжно
 * протащить через history state, поэтому — модульный «карман»: страница
 * кладёт действие, EditorPage забирает его при монтировании (одноразово).
 */
export type HomeAction =
  /** Главная: открыть загруженный файл (.md/.zip). */
  | { kind: 'upload'; file: File }
  /** Страница /create: генерация запущена — поллить job и писать в редактор. */
  | { kind: 'track'; jobId: string; topic: string }

let pending: HomeAction | null = null

export function setHomeAction(action: HomeAction): void {
  pending = action
}

export function consumeHomeAction(): HomeAction | null {
  const action = pending
  pending = null
  return action
}
