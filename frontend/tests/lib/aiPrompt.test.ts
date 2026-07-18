/**
 * AI-9 (docs/specs/ai-agent.md): применение разбора промпта к настройкам
 * отчёта («null — не упомянуто, тоггл не трогаем») и сборка опций генерации.
 */
import { describe, expect, it } from 'vitest'
import { validatePrompt } from '../../src/components/AiConsole'
import {
  applyPromptAnalysis,
  buildGenerateOptions,
  PromptAnalysis,
  ReportOptions,
} from '../../src/lib/aiPrompt'

describe('AI-9 ступень 1: validatePrompt (локальные правила, без сети)', () => {
  it('правка пустого документа — ошибка независимо от текста', () => {
    expect(validatePrompt('нормальная инструкция', 'edit', true)).toMatch(/Документ пуст/)
  })

  it('короче 5 символов — ошибка с формулировкой под режим', () => {
    expect(validatePrompt('абв', 'new', true)).toMatch(/Тема слишком короткая/)
    expect(validatePrompt('абв', 'edit', false)).toMatch(/Опишите правку/)
  })

  it('длиннее 4000 символов — ошибка', () => {
    expect(validatePrompt('а'.repeat(4001), 'new', true)).toMatch(/слишком длинный/)
  })

  it('нет трёх букв подряд — ошибка', () => {
    expect(validatePrompt('12345 !@# 67', 'new', true)).toMatch(/осмысленный текст/)
  })

  it('осмысленный текст проходит (null)', () => {
    expect(validatePrompt('Разработка информационной системы', 'new', true)).toBeNull()
    expect(validatePrompt('сделай введение подробнее', 'edit', false)).toBeNull()
  })
})

const CURRENT: ReportOptions = {
  pages: 15,
  bib: true,
  tables: true,
  diagrams: true,
  formulas: false,
  images: false,
  webImages: false,
  codeAppendix: false,
}

const EMPTY_ANALYSIS: PromptAnalysis = {
  ok: true,
  reason: null,
  topic: '',
  requirements: '',
  targetPages: null,
  includeTables: null,
  includeDiagrams: null,
  includeFormulas: null,
  includeImages: null,
  includeWebImages: null,
  includeCodeAppendix: null,
  includeBibliography: null,
}

describe('AI-9: applyPromptAnalysis', () => {
  it('null-поля не трогают текущие настройки, touched=false', () => {
    const { next, touched } = applyPromptAnalysis(EMPTY_ANALYSIS, CURRENT)
    expect(next).toEqual(CURRENT)
    expect(touched).toBe(false)
  })

  it('извлечённые поля перекрывают настройки, touched=true', () => {
    const { next, touched } = applyPromptAnalysis(
      { ...EMPTY_ANALYSIS, targetPages: 25, includeDiagrams: false },
      CURRENT,
    )
    expect(next.pages).toBe(25)
    expect(next.diagrams).toBe(false)
    expect(next.tables).toBe(true)
    expect(touched).toBe(true)
  })

  it('совпадающее с текущим значение не даёт touched', () => {
    const { touched } = applyPromptAnalysis({ ...EMPTY_ANALYSIS, includeTables: true }, CURRENT)
    expect(touched).toBe(false)
  })

  it('сбой analyze-prompt (a=null) оставляет всё как есть', () => {
    const { next, touched } = applyPromptAnalysis(null, CURRENT)
    expect(next).toEqual(CURRENT)
    expect(touched).toBe(false)
  })
})

describe('AI-9: buildGenerateOptions', () => {
  it('тема и требования из разбора; пустая тема — фолбэк на текст промпта', () => {
    const withTopic = buildGenerateOptions(
      { ...EMPTY_ANALYSIS, topic: 'Фильтр Калмана', requirements: '25 страниц' },
      'промпт целиком',
      'balanced',
      CURRENT,
    )
    expect(withTopic.topic).toBe('Фильтр Калмана')
    expect(withTopic.requirements).toBe('25 страниц')

    const fallback = buildGenerateOptions(null, 'промпт целиком', 'fast', CURRENT)
    expect(fallback.topic).toBe('промпт целиком')
    expect(fallback.requirements).toBe('')
    expect(fallback.quality).toBe('fast')
  })

  it('настройки отчёта раскладываются в snake_case-поля опций', () => {
    const opts = buildGenerateOptions(null, 'т', 'quality', {
      ...CURRENT,
      pages: 30,
      codeAppendix: true,
    })
    expect(opts).toMatchObject({
      target_pages: 30,
      include_bibliography: true,
      include_tables: true,
      include_diagrams: true,
      include_formulas: false,
      include_images: false,
      include_web_images: false,
      include_code_appendix: true,
    })
  })
})
