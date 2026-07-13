import { useEffect, useMemo, useRef, useState } from 'react'
import { aiApi, AiJob, AiPricing, AiQuality, AiTierPricing } from '../api'
import { renderAll } from '../lib/gostRender'
import { parseMD } from '../lib/markdown'
import type { Settings } from '../lib/settings'
import { CloseIcon, SparklesIcon, Spinner } from './icons'
import { SegButton, SettingRow, TextField, Toggle } from './ui'

export type AiJobKind = 'generate' | 'edit'

interface AiModalProps {
  defaultTopic: string
  currentMd: string
  settings: Settings
  onSettingChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  job: AiJob | null
  onStarted: (jobId: string, successMsg: string, kind: AiJobKind) => void
  onCancel: () => void
  onClose: () => void
  onToast: (msg: string) => void
}

/** Заголовки 1-го уровня документа (вне код-фенсов) — как их видит бэкенд. */
function sectionTitles(md: string): string[] {
  const out: string[] = []
  let inCode = false
  for (const line of md.split('\n')) {
    if (line.trim().startsWith('```')) inCode = !inCode
    const m = inCode ? null : line.match(/^#\s+(.+?)\s*$/)
    if (m) out.push(m[1])
  }
  return out
}

// Титульный лист собирается автоматически из настроек документа и к ИИ
// НЕ передаётся; здесь правится только тема на титуле.

const TIERS: { id: AiQuality; label: string; hint: string }[] = [
  { id: 'fast', label: 'Быстро', hint: '~2–4 мин' },
  { id: 'balanced', label: 'Баланс', hint: '~4–7 мин' },
  { id: 'quality', label: 'Качество', hint: '~6–12 мин' },
]

/** Грубая оценка токенов конвейера генерации (план + разделы + самопроверка). */
function genCost(p: AiTierPricing, pages: number): number {
  const inTok = pages * 3300 + 8000
  const outTok = (pages * 2300 + 2000) * (p.reasoning ? 1.35 : 1)
  return (inTok * p.promptPerMillion + outTok * p.completionPerMillion) / 1e6
}

/** Оценка правки: документ читается и переписывается целиком. */
function editCost(p: AiTierPricing, mdChars: number): number {
  const docTok = mdChars / 3
  const outTok = docTok * 1.1 * (p.reasoning ? 1.35 : 1)
  return ((docTok + 800) * p.promptPerMillion + outTok * p.completionPerMillion) / 1e6
}

function rub(v: number): string {
  return '≈ ' + (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' ₽'
}

export function AiModal({
  defaultTopic,
  currentMd,
  settings,
  onSettingChange,
  job,
  onStarted,
  onCancel,
  onClose,
  onToast,
}: AiModalProps) {
  const [mode, setMode] = useState<'generate' | 'edit'>('generate')
  const [instruction, setInstruction] = useState('')
  // '' — правится весь документ, иначе — заголовок выбранного раздела.
  const [section, setSection] = useState('')
  const sections = useMemo(() => sectionTitles(currentMd), [currentMd])
  const [topic, setTopic] = useState(defaultTopic)
  const [requirements, setRequirements] = useState('')
  const [pages, setPages] = useState(15)
  const [quality, setQuality] = useState<AiQuality>('balanced')
  const [bib, setBib] = useState(true)
  const [tables, setTables] = useState(true)
  const [diagrams, setDiagrams] = useState(true)
  const [formulas, setFormulas] = useState(false)
  const [images, setImages] = useState(false)
  const [webImages, setWebImages] = useState(false)
  const [codeAppendix, setCodeAppendix] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [pricing, setPricing] = useState<AiPricing | null>(null)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    aiApi.pricing().then(setPricing).catch(() => {})
  }, [])

  const running = starting || job?.status === 'queued' || job?.status === 'running'

  useEffect(() => {
    if (!running) setStopping(false)
  }, [running])

  // Живой предпросмотр: готовые разделы рендерятся тем же ГОСТ-рендером, что и
  // превью, но одной лентой без разбивки на страницы. mermaid/картинки на этом
  // этапе ещё не построены — вместо них заглушки.
  const partialHtml = useMemo(() => {
    const p = job?.partial
    if (!p || !running) return ''
    try {
      return renderAll(parseMD(p), settings, () => null)
        .out.map((b) => b.html)
        .join('')
    } catch {
      return ''
    }
  }, [job?.partial, running, settings])

  // Автопрокрутка предпросмотра вниз — к только что дописанному разделу.
  const previewRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = previewRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [partialHtml])

  const start = async () => {
    if (running) return
    if (mode === 'generate' && topic.trim().length < 3) {
      onToast('Укажите тему работы')
      return
    }
    if (mode === 'edit') {
      if (instruction.trim().length < 3) {
        onToast('Опишите, что нужно исправить')
        return
      }
      if (!currentMd.trim()) {
        onToast('Документ пуст — исправлять нечего')
        return
      }
    }
    setStarting(true)
    try {
      if (mode === 'edit') {
        const { jobId } = section
          ? await aiApi.editSection(instruction.trim(), section, currentMd)
          : await aiApi.edit(instruction.trim(), currentMd)
        onStarted(jobId, 'Правка готова', 'edit')
      } else {
        const { jobId } = await aiApi.generate(
          {
            topic: topic.trim(),
            requirements: requirements.trim(),
            target_pages: pages,
            quality,
            include_bibliography: bib,
            include_tables: tables,
            include_diagrams: diagrams,
            include_formulas: formulas,
            include_images: images,
            include_web_images: webImages,
            include_code_appendix: codeAppendix,
          },
          files,
        )
        onStarted(jobId, 'Курсовая сгенерирована — текст загружен в редактор', 'generate')
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Не удалось запустить задачу')
    } finally {
      setStarting(false)
    }
  }

  const editTier = pricing?.tiers.balanced

  return (
    <div
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--overlay)', backdropFilter: 'blur(3px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-pop-in flex flex-col overflow-hidden bg-surface text-ink"
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: '84vh',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(61,57,41,.28)',
        }}
      >
        <div className="flex items-center px-[22px] pb-2 pt-[18px]">
          <div className="flex items-center gap-2 text-[16.5px] font-bold tracking-tight">
            <span style={{ color: 'var(--warm)' }}>
              <SparklesIcon size={18} />
            </span>
            {mode === 'generate' ? 'Генерация курсовой работы' : 'Правка работы с ИИ'}
          </div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            title="Закрыть (задача продолжится в фоне)"
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border-none bg-hover text-soft hover:bg-hover-2"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="px-[22px] text-xs text-muted">
          {mode === 'generate'
            ? 'ИИ-агент составит план по ГОСТ 7.32-2017, напишет разделы и сам проверит результат. Готовый markdown попадёт в редактор, где его можно править вручную.'
            : 'Опишите своими словами, что исправить в текущем документе, — ИИ применит правки и обновит текст в редакторе.'}
        </div>

        <div className="mx-[22px] mt-3 flex gap-1 rounded-[10px] bg-hover p-1">
          <SegButton active={mode === 'generate'} onClick={() => !running && setMode('generate')}>
            Сгенерировать с нуля
          </SegButton>
          <SegButton active={mode === 'edit'} onClick={() => !running && setMode('edit')}>
            Исправить текущий текст
          </SegButton>
        </div>

        {running && partialHtml ? (
          <div className="flex min-h-0 flex-1 flex-col px-[22px] pb-2 pt-4">
            <div className="pb-2 text-[11.5px] font-medium text-muted">
              Разделы появляются по мере готовности — можно читать, пока пишутся следующие.
              Если начало не нравится, остановите генерацию, чтобы не тратить деньги.
            </div>
            <div
              ref={previewRef}
              className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-edge px-7 py-6"
              style={{
                background: '#fff',
                color: '#000',
                fontFamily: "'Times New Roman',Times,serif",
                fontSize: '11.5pt',
                lineHeight: 1.5,
                textAlign: 'justify',
              }}
              dangerouslySetInnerHTML={{ __html: partialHtml }}
            />
          </div>
        ) : mode === 'edit' ? (
          <div className="flex-1 overflow-y-auto px-[22px] pb-2 pt-4">
            {sections.length > 0 && (
              <label className="flex flex-col gap-1 pb-3">
                <span className="text-[11.5px] font-medium text-muted">
                  Что править (один раздел — быстрее и дешевле, остальной текст не тронется)
                </span>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  disabled={running}
                  className="cursor-pointer rounded-lg border border-edge bg-paper px-2.5 py-2 text-[13px] text-ink focus:border-accent"
                >
                  <option value="">Весь документ</option>
                  {sections.map((t) => (
                    <option key={t} value={t}>
                      Раздел «{t}»
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-medium text-muted">
                Что нужно исправить или изменить?
              </span>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={running}
                rows={6}
                placeholder={
                  'Например: перепиши введение более научным стилем;\nдобавь таблицу сравнения в раздел 2;\nсократи заключение до одной страницы'
                }
                className="resize-y rounded-lg border border-edge bg-paper px-2.5 py-2 text-[13px] text-ink focus:border-accent"
              />
            </label>
            <div className="pt-2 text-[11.5px] text-faint">
              {section
                ? `ИИ получит план работы и только раздел «${section}», перепишет его и подошьёт на место.`
                : `ИИ получит весь текущий документ (${Math.round(currentMd.length / 1000)} тыс. символов) и вернёт исправленную версию целиком${editTier ? ` — ${rub(editCost(editTier, currentMd.length))}` : ''}.`}{' '}
              Перед применением вы увидите изменения и сможете их отклонить.
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-[22px] pb-2 pt-4">
            <div className="flex flex-col gap-3">
              <TextField
                label="Тема работы"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Например: Разработка веб-сервиса учёта заказов"
                disabled={running}
              />
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] font-medium text-muted">
                  Требования и пожелания (методичка, особенности, объём разделов…)
                </span>
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  disabled={running}
                  rows={3}
                  className="resize-y rounded-lg border border-edge bg-paper px-2.5 py-2 text-[13px] text-ink focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px] font-medium text-muted">
                  Файлы-источники (PDF, DOCX, TXT, MD — до 5 шт.)
                </span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md"
                  disabled={running}
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
                  className="text-[12.5px] text-soft file:mr-3 file:cursor-pointer file:rounded-full file:border-none file:bg-hover file:px-3.5 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
                />
              </label>

              <div className="flex flex-col gap-1">
                <span className="text-[11.5px] font-medium text-muted">
                  Качество и скорость (видна примерная стоимость генерации)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {TIERS.map((t) => {
                    const p = pricing?.tiers[t.id]
                    const active = quality === t.id
                    return (
                      <button
                        key={t.id}
                        disabled={running}
                        onClick={() => setQuality(t.id)}
                        className="flex cursor-pointer flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors"
                        style={{
                          borderColor: active ? '#d97757' : 'var(--edge)',
                          background: active ? 'var(--warm-bg)' : 'var(--paper)',
                        }}
                      >
                        <span className="text-[13px] font-semibold text-ink">{t.label}</span>
                        <span className="text-[11px] text-muted">{t.hint}</span>
                        <span className="text-[12px] font-semibold" style={{ color: 'var(--warm)' }}>
                          {p ? rub(genCost(p, pages)) : '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <SettingRow label="Целевой объём" desc="Примерное число страниц основной части">
              <div className="flex flex-shrink-0 items-center gap-2.5">
                <input
                  type="range"
                  min={5}
                  max={40}
                  step={1}
                  value={pages}
                  disabled={running}
                  onChange={(e) => setPages(+e.target.value)}
                  style={{ width: 120, accentColor: '#d97757' }}
                />
                <span
                  className="text-right text-[12.5px] text-soft"
                  style={{ width: 50, fontVariantNumeric: 'tabular-nums' }}
                >
                  ~{pages} стр.
                </span>
              </div>
            </SettingRow>
            <SettingRow label="Список литературы" desc="Раздел источников, оформленный по ГОСТ">
              <Toggle on={bib} onToggle={() => !running && setBib(!bib)} />
            </SettingRow>
            <SettingRow label="Таблицы" desc="Сравнения и сводные данные в разделах">
              <Toggle on={tables} onToggle={() => !running && setTables(!tables)} />
            </SettingRow>
            <SettingRow label="Mermaid-схемы" desc="Диаграммы архитектуры и процессов">
              <Toggle on={diagrams} onToggle={() => !running && setDiagrams(!diagrams)} />
            </SettingRow>
            <SettingRow label="Формулы" desc="Выключные LaTeX-формулы с пояснениями">
              <Toggle on={formulas} onToggle={() => !running && setFormulas(!formulas)} />
            </SettingRow>
            <SettingRow
              label="Приложение с кодом"
              desc="В конец работы — «Приложение А» с листингами кода по теме"
            >
              <Toggle on={codeAppendix} onToggle={() => !running && setCodeAppendix(!codeAppendix)} />
            </SettingRow>
            <SettingRow
              label="Графики (строит ИИ)"
              desc="ИИ напишет matplotlib-скрипты, сервер выполнит их и встроит готовые графики"
            >
              <Toggle on={images} onToggle={() => !running && setImages(!images)} />
            </SettingRow>

            <div className="mb-1 mt-3.5 flex flex-col rounded-xl border border-edge bg-paper px-4 pb-3 pt-1">
              <SettingRow
                label="Картинки из интернета"
                desc="ИИ подберёт ссылки на реальные изображения, сервер их скачает и встроит"
              >
                <Toggle on={webImages} onToggle={() => !running && setWebImages(!webImages)} />
              </SettingRow>
              <SettingRow
                label="Титульный лист"
                desc="Собирается автоматически из полей ниже — данные НЕ передаются ИИ"
              >
                <Toggle
                  on={settings.titlePage}
                  onToggle={() => !running && onSettingChange('titlePage', !settings.titlePage)}
                />
              </SettingRow>
              {settings.titlePage && (
                <div className="flex flex-col gap-1.5 pt-2">
                  <TextField
                    label="Тема на титульном листе"
                    value={settings.topic}
                    disabled={running}
                    onChange={(e) => onSettingChange('topic', e.target.value)}
                    className="!bg-surface"
                  />
                  <span className="text-[10.5px] text-faint">
                    Остальные блоки титульника (вуз, исполнители, логотип) — в настройках
                    документа: ⚙ над превью
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-hover px-[22px] py-3.5">
          {running && job && (
            <div className="pb-3">
              <div className="flex items-center justify-between pb-1.5 text-xs text-soft">
                <span>{job.stage}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(job.progress * 100)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${Math.max(3, job.progress * 100)}%` }}
                />
              </div>
            </div>
          )}
          {job?.status === 'error' && (
            <div className="pb-3 text-xs" style={{ color: 'var(--danger)' }}>
              Ошибка: {job.error}
            </div>
          )}
          <div className="flex items-center">
            <div className="text-[11.5px] text-faint">
              {running
                ? 'Окно можно закрыть — задача продолжится в фоне (прогресс в шапке)'
                : mode === 'generate'
                  ? 'Генерация занимает несколько минут'
                  : 'Правка может занять пару минут'}
            </div>
            <div className="flex-1" />
            {running ? (
              <button
                onClick={() => {
                  setStopping(true)
                  onCancel()
                }}
                disabled={stopping}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-warm-border bg-transparent px-[18px] py-2 text-[13px] font-semibold text-danger transition-colors hover:bg-warm-bg disabled:opacity-60"
              >
                {stopping ? <Spinner /> : null}
                {stopping ? 'Останавливаем…' : 'Остановить'}
              </button>
            ) : (
              <button
                onClick={start}
                className="flex cursor-pointer items-center gap-2 rounded-full border-none bg-accent px-[18px] py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-dark"
              >
                <SparklesIcon />
                {mode === 'generate' ? 'Сгенерировать' : 'Исправить'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
