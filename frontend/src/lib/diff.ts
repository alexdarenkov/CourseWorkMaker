/**
 * Построчный diff для просмотра ИИ-правки перед применением.
 *
 * Правки обычно локальны, поэтому сначала срезается общий префикс/суффикс,
 * а LCS считается только по изменившейся середине. Для патологически больших
 * замен (середина > ~500k ячеек DP) честный LCS заменяется на «всё удалено /
 * всё добавлено» — это редкий случай полной перегенерации текста.
 */

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
}

const MAX_DP_CELLS = 500_000

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const middle: DiffLine[] =
    midA.length * midB.length > MAX_DP_CELLS
      ? [
          ...midA.map((text) => ({ type: 'del' as const, text })),
          ...midB.map((text) => ({ type: 'add' as const, text })),
        ]
      : lcsDiff(midA, midB)

  return [
    ...a.slice(0, start).map((text) => ({ type: 'same' as const, text })),
    ...middle,
    ...a.slice(endA).map((text) => ({ type: 'same' as const, text })),
  ]
}

function lcsDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length
  const m = b.length
  // dp[i][j] — длина LCS хвостов a[i:], b[j:] (плоский массив для скорости).
  const w = m + 1
  const dp = new Int32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] =
        a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      out.push({ type: 'del', text: a[i] })
      i++
    } else {
      out.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] })
  while (j < m) out.push({ type: 'add', text: b[j++] })
  return out
}

export interface DiffStats {
  added: number
  removed: number
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.type === 'add') added++
    else if (l.type === 'del') removed++
  }
  return { added, removed }
}
