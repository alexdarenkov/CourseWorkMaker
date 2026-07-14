import { useRef, useState } from 'react'
import { convertApi } from '../api'
import { addImageAsset, addRawAsset, getAsset } from '../lib/assets'
import type { Settings } from '../lib/settings'
import { CloseIcon, Spinner } from './icons'
import { SettingRow, TextField, Toggle } from './ui'

/** Многострочный блок титульного листа. */
function TitleArea(props: {
  label: string
  hint?: string
  rows: number
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="mt-2.5 flex flex-col gap-1">
      <span className="text-[11.5px] font-medium text-muted">{props.label}</span>
      <textarea
        value={props.value}
        rows={props.rows}
        onChange={(e) => props.onChange(e.target.value)}
        className="resize-y rounded-lg border border-edge bg-surface px-2.5 py-2 text-[12.5px] leading-relaxed text-ink focus:border-accent"
      />
      {props.hint && <span className="text-[10.5px] leading-snug text-faint">{props.hint}</span>}
    </label>
  )
}

interface SettingsModalProps {
  settings: Settings
  section: 'doc' | 'ed'
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  onClose: () => void
}

const DOC_TOGGLES: { key: keyof Settings; label: string; desc: string }[] = [
  { key: 'titlePage', label: 'Титульный лист', desc: 'Первая страница работы по форме вуза' },
  { key: 'toc', label: 'Содержание', desc: 'Автогенерация из заголовков с номерами страниц' },
  { key: 'pageNumbers', label: 'Нумерация страниц', desc: 'Внизу по центру, на титуле номер скрыт' },
  {
    key: 'bibliography',
    label: 'Список литературы по ГОСТ',
    desc: 'Нумерация источников в разделе «Список…»',
  },
  {
    key: 'autoNumber',
    label: 'Нумерация рисунков, таблиц и формул',
    desc: '«Рисунок 1 — …», «Таблица 1 — …», (1)',
  },
]

// Блоки титульного листа: свободный формат покрывает и курсовую по ГОСТ,
// и отчёты по лабораторным с несколькими исполнителями и логотипом вуза.

const ED_TOGGLES: { key: keyof Settings; label: string; desc: string }[] = [
  {
    key: 'showDiff',
    label: 'Diff-просмотр ИИ-правок',
    desc: 'Показывать изменения в редакторе перед применением; выкл — применять сразу',
  },
  { key: 'syntaxHl', label: 'Подсветка синтаксиса', desc: 'Заголовки, жирный, код, формулы, ссылки' },
  { key: 'wordWrap', label: 'Перенос строк', desc: 'Длинные строки переносятся по ширине окна' },
  { key: 'lineNumbers', label: 'Номера строк', desc: 'Показываются при выключенном переносе строк' },
]

export function SettingsModal({ settings: s, section, onChange, onClose }: SettingsModalProps) {
  const logoRef = useRef<HTMLInputElement>(null)
  const customRef = useRef<HTMLInputElement>(null)
  const [customBusy, setCustomBusy] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const logoSrc = s.titleLogo?.startsWith('asset:') ? getAsset(s.titleLogo) : s.titleLogo || null
  const customSrc = s.titleCustom ? getAsset(s.titleCustom) : null

  const uploadCustomTitle = async (file: File) => {
    setCustomBusy(true)
    setCustomError(null)
    try {
      const { image } = await convertApi.titleImage(file)
      onChange('titleCustom', addRawAsset(image, 'title'))
    } catch (e) {
      setCustomError(
        e instanceof Error && e.message !== 'Ошибка 401'
          ? e.message
          : 'Не удалось обработать файл — нужен вход в аккаунт и файл PDF/DOCX',
      )
    } finally {
      setCustomBusy(false)
    }
  }

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
          width: 620,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: '84vh',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(61,57,41,.28)',
        }}
      >
        <div className="flex items-center px-[22px] pb-3.5 pt-[18px]">
          <div className="text-[16.5px] font-bold tracking-tight">
            {section === 'doc' ? 'Настройки документа · ГОСТ' : 'Настройки редактора'}
          </div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            title="Закрыть"
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border-none bg-hover text-soft hover:bg-hover-2"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-[22px] pb-[18px] pt-0.5">
          {section === 'doc' && (
            <>
              {DOC_TOGGLES.map((t) => (
                <SettingRow key={t.key} label={t.label} desc={t.desc}>
                  <Toggle
                    on={s[t.key] as boolean}
                    onToggle={() => onChange(t.key, !s[t.key] as never)}
                  />
                </SettingRow>
              ))}
              {s.titlePage && (
                <div className="mb-1 mt-3.5 flex flex-col rounded-xl border border-edge bg-paper px-4 pb-4 pt-2">
                  <div className="pb-0.5 pt-2 text-[11px] font-bold uppercase tracking-[.08em] text-faint">
                    Титульный лист
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11.5px] font-medium text-muted">
                        Свой титульник (PDF или DOCX)
                      </span>
                      <span className="text-[10.5px] text-faint">
                        Первая страница файла заменит конструктор ниже
                      </span>
                    </div>
                    <input
                      ref={customRef}
                      type="file"
                      accept=".pdf,.docx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadCustomTitle(f)
                        e.target.value = ''
                      }}
                    />
                    {customSrc ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={customSrc}
                          alt=""
                          className="h-14 rounded border border-edge bg-white object-contain"
                        />
                        <button
                          onClick={() => onChange('titleCustom', '')}
                          className="cursor-pointer rounded-full border border-edge bg-transparent px-3 py-1 text-[11.5px] font-semibold text-soft hover:bg-hover"
                        >
                          Убрать
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => customRef.current?.click()}
                        disabled={customBusy}
                        className="flex cursor-pointer items-center gap-2 rounded-full border border-edge bg-transparent px-3.5 py-1.5 text-[12px] font-semibold text-soft hover:bg-hover disabled:opacity-60"
                      >
                        {customBusy && <Spinner size={12} />}
                        {customBusy ? 'Обрабатываем…' : 'Загрузить…'}
                      </button>
                    )}
                  </div>
                  {customError && (
                    <div className="mt-1 text-[11px]" style={{ color: 'var(--danger)' }}>
                      {customError}
                    </div>
                  )}
                  {s.titleCustom ? (
                    <div className="mt-2 rounded-lg bg-hover px-3 py-2 text-[11px] leading-snug text-muted">
                      Используется загруженный титульник. Уберите его, чтобы вернуться к
                      конструктору (шапка, логотип, исполнители).
                    </div>
                  ) : (
                    <>
                  <TitleArea
                    label="Шапка (вверху, по центру)"
                    hint="Министерство/вуз/кафедра — каждая строка с новой строки"
                    rows={4}
                    value={s.titleHeader}
                    onChange={(v) => onChange('titleHeader', v)}
                  />
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11.5px] font-medium text-muted">Логотип вуза</span>
                      <span className="text-[10.5px] text-faint">
                        По центру под шапкой, до 60×40 мм
                      </span>
                    </div>
                    <input
                      ref={logoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (f) onChange('titleLogo', await addImageAsset(f))
                        e.target.value = ''
                      }}
                    />
                    {logoSrc ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={logoSrc}
                          alt=""
                          className="h-10 max-w-[70px] rounded border border-edge bg-white object-contain p-0.5"
                        />
                        <button
                          onClick={() => onChange('titleLogo', '')}
                          className="cursor-pointer rounded-full border border-edge bg-transparent px-3 py-1 text-[11.5px] font-semibold text-soft hover:bg-hover"
                        >
                          Убрать
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => logoRef.current?.click()}
                        className="cursor-pointer rounded-full border border-edge bg-transparent px-3.5 py-1.5 text-[12px] font-semibold text-soft hover:bg-hover"
                      >
                        Загрузить…
                      </button>
                    )}
                  </div>
                  <TitleArea
                    label="Тип работы (в середине, по центру)"
                    hint="Строка ПРОПИСНЫМИ выводится крупно и полужирно (например «КУРСОВАЯ РАБОТА»)"
                    rows={3}
                    value={s.titleWork}
                    onChange={(v) => onChange('titleWork', v)}
                  />
                  <div className="mt-2.5">
                    <TextField
                      label="Тема (полужирно, в кавычках)"
                      value={s.topic}
                      onChange={(e) => onChange('topic', e.target.value)}
                      className="!bg-surface"
                    />
                  </div>
                  <TitleArea
                    label="Исполнители и принимающий"
                    hint="«Метка: текст» — метка слева, текст справа; строка без метки — справа; пустая строка — отступ"
                    rows={6}
                    value={s.titlePeople}
                    onChange={(v) => onChange('titlePeople', v)}
                  />
                  <TitleArea
                    label="Внизу (по центру)"
                    hint="Например «Москва, 2026» одной строкой"
                    rows={2}
                    value={s.titleBottom}
                    onChange={(v) => onChange('titleBottom', v)}
                  />
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {section === 'ed' && (
            <>
              <SettingRow label="Размер шрифта" desc="Моноширинный шрифт редактора">
                <div className="flex flex-shrink-0 items-center gap-2.5">
                  <input
                    type="range"
                    min={12}
                    max={18}
                    step={1}
                    value={s.fontSize}
                    onChange={(e) => onChange('fontSize', +e.target.value)}
                    style={{ width: 120, accentColor: '#d97757' }}
                  />
                  <span
                    className="text-right text-[12.5px] text-soft"
                    style={{ width: 38, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {s.fontSize} px
                  </span>
                </div>
              </SettingRow>
              {ED_TOGGLES.map((t) => (
                <SettingRow key={t.key} label={t.label} desc={t.desc}>
                  <Toggle
                    on={s[t.key] as boolean}
                    onToggle={() => onChange(t.key, !s[t.key] as never)}
                  />
                </SettingRow>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
