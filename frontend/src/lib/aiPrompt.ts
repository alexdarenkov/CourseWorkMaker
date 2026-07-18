/**
 * Чистая логика ИИ-консоли: применение результата analyze-prompt к настройкам
 * отчёта и сборка опций генерации (AI-9, docs/specs/ai-agent.md).
 * Сама validatePrompt (ступень 1) живёт в components/AiConsole.tsx.
 */
import type { AiOptions, AiQuality } from '../api'

/** Настройки отчёта из ⚙-поповера консоли. */
export interface ReportOptions {
  pages: number
  bib: boolean
  tables: boolean
  diagrams: boolean
  formulas: boolean
  images: boolean
  webImages: boolean
  codeAppendix: boolean
}

/** Ответ POST /ai/analyze-prompt (null в extract-полях — «в промпте не упомянуто»). */
export interface PromptAnalysis {
  ok: boolean
  reason: string | null
  topic: string
  requirements: string
  targetPages: number | null
  includeTables: boolean | null
  includeDiagrams: boolean | null
  includeFormulas: boolean | null
  includeImages: boolean | null
  includeWebImages: boolean | null
  includeCodeAppendix: boolean | null
  includeBibliography: boolean | null
}

/** Подстраивает настройки отчёта под разбор промпта: null-поля не трогают
 *  текущие значения; touched — изменилось ли хоть что-то (для тоста). */
export function applyPromptAnalysis(
  a: PromptAnalysis | null,
  current: ReportOptions,
): { next: ReportOptions; touched: boolean } {
  const next: ReportOptions = {
    pages: a?.targetPages ?? current.pages,
    bib: a?.includeBibliography ?? current.bib,
    tables: a?.includeTables ?? current.tables,
    diagrams: a?.includeDiagrams ?? current.diagrams,
    formulas: a?.includeFormulas ?? current.formulas,
    images: a?.includeImages ?? current.images,
    webImages: a?.includeWebImages ?? current.webImages,
    codeAppendix: a?.includeCodeAppendix ?? current.codeAppendix,
  }
  const touched = (Object.keys(next) as (keyof ReportOptions)[]).some(
    (k) => next[k] !== current[k],
  )
  return { next, touched }
}

/** Опции POST /ai/generate: тема/требования из разбора (фолбэк — сам промпт). */
export function buildGenerateOptions(
  a: PromptAnalysis | null,
  text: string,
  quality: AiQuality,
  next: ReportOptions,
): AiOptions {
  return {
    topic: a?.topic || text,
    requirements: a?.requirements || '',
    target_pages: next.pages,
    quality,
    include_bibliography: next.bib,
    include_tables: next.tables,
    include_diagrams: next.diagrams,
    include_formulas: next.formulas,
    include_images: next.images,
    include_web_images: next.webImages,
    include_code_appendix: next.codeAppendix,
  }
}
