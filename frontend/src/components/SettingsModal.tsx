import { useRef } from 'react'
import { addImageAsset, getAsset } from '../lib/assets'
import type { Settings } from '../lib/settings'
import { ModalCloseButton, ModalShell, SettingRow, TextField, Toggle } from './ui'

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
  { key: 'syntaxHl', label: 'Подсветка синтаксиса', desc: 'Заголовки, жирный, код, формулы, ссылки' },
  { key: 'wordWrap', label: 'Перенос строк', desc: 'Длинные строки переносятся по ширине окна' },
  { key: 'lineNumbers', label: 'Номера строк', desc: 'Показываются при выключенном переносе строк' },
]

export function SettingsModal({ settings: s, section, onChange, onClose }: SettingsModalProps) {
  const logoRef = useRef<HTMLInputElement>(null)
  const logoSrc = s.titleLogo?.startsWith('asset:') ? getAsset(s.titleLogo) : s.titleLogo || null

  return (
    <ModalShell onClose={onClose} width={620} maxHeight="84vh">
        <div className="flex items-center px-6 pb-3.5 pt-5">
          <h2 className="m-0 font-serif text-2xl font-normal" style={{ letterSpacing: '-.015em' }}>
            {section === 'doc' ? 'Настройки документа' : 'Настройки редактора'}
          </h2>
          <div className="flex-1" />
          <ModalCloseButton onClose={onClose} />
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
                <div className="mb-1 mt-3.5 flex flex-col rounded-xl border border-edge bg-surface px-4 pb-4 pt-2">
                  <div className="pb-0.5 pt-2 text-[11px] font-bold uppercase tracking-[.08em] text-faint">
                    Титульный лист
                  </div>
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
                    style={
                      {
                        width: 120,
                        '--fill': `${Math.round(((s.fontSize - 12) / 6) * 100)}%`,
                      } as React.CSSProperties
                    }
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
    </ModalShell>
  )
}
