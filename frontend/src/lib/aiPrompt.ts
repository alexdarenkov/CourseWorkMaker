/**
 * Чистая логика точек входа ИИ: локальная валидация промпта (ступень 1 AI-9),
 * применение результата analyze-prompt к настройкам отчёта и сборка опций
 * генерации (docs/specs/ai-agent.md). Используется диалогом создания
 * (NewReportModal) и консолью правок (AiConsole).
 */
import type { AiOptions, AiQuality } from '../api'

/** Проверка промпта ДО отправки: пустышки и мусор не уходят на бэкенд (AI-9). */
export function validatePrompt(
  text: string,
  mode: 'new' | 'edit',
  docEmpty: boolean,
): string | null {
  const t = text.trim()
  if (mode === 'edit' && docEmpty) {
    return 'Документ пуст — исправлять нечего. Сначала создайте отчёт.'
  }
  if (t.length < 5) {
    return mode === 'new'
      ? 'Тема слишком короткая — сформулируйте её подробнее (минимум 5 символов).'
      : 'Опишите правку подробнее (минимум 5 символов).'
  }
  if (t.length > 4000) {
    return 'Промпт слишком длинный (до 4000 символов).'
  }
  if (!/[а-яёa-z]{3,}/i.test(t)) {
    return 'Промпт должен содержать осмысленный текст, а не только цифры и символы.'
  }
  return null
}

/** Настройки отчёта из диалога создания. */
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
