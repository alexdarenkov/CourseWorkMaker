import { useRef } from 'react'
import { addImageAsset, getAsset } from '../lib/assets'
import { EDITOR_FONT_PX_MAX, EDITOR_FONT_PX_MIN, type Settings } from '../lib/settings'
import { Button, FieldGroup, ModalCloseButton, ModalShell, RangeField, SettingRow, TextAreaField, TextField, Toggle } from './ui'

/** Многострочный блок титульного листа. */
function TitleArea(props: {
  label: string
  hint?: string
  rows: number
  value: string
  onChange: (v: string) => void
}) {
  return <TextAreaField label={props.label} hint={props.hint} rows={props.rows} value={props.value} onChange={e => props.onChange(e.target.value)} />
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
  { key: 'pageNumbers', label: 'Нумерация страниц', desc: 'Внизу по центру, на титуле скрыт' },
  {
    key: 'autoNumber',
    label: 'Нумерация рисунков, таблиц и формул',
    desc: '«Рисунок 1 — …», «Таблица 1 — …», (1)',
  },
  {
    key: 'bibliography',
    label: 'Список литературы по ГОСТ',
    desc: 'Нумерация источников в разделе «Список…»',
  },
]

// Блоки титульного листа: свободный формат покрывает и курсовую по ГОСТ,
// и отчёты по лабораторным с несколькими исполнителями и логотипом вуза.

const ED_TOGGLES: { key: keyof Settings; label: string; desc: string }[] = [
  { key: 'syntaxHl', label: 'Подсветка синтаксиса', desc: 'Заголовки, жирный, код, формулы, ссылки' },
  { key: 'wordWrap', label: 'Перенос строк', desc: 'Длинные строки переносятся по ширине окна' },
  { key: 'lineNumbers', label: 'Номера строк', desc: 'Показываются при выключенном переносе' },
]

export function SettingsModal({ settings: s, section, onChange, onClose }: SettingsModalProps) {
  const logoRef = useRef<HTMLInputElement>(null)
  const logoSrc = s.titleLogo?.startsWith('asset:') ? getAsset(s.titleLogo) : s.titleLogo || null

  return (
    <ModalShell label={section === 'doc' ? 'Настройки документа' : 'Настройки редактора'} onClose={onClose} width={464} maxHeight="calc(100vh / var(--ui-zoom) - 48px)" panelClassName="settings-modal flex flex-col overflow-hidden">
        <div className="window-titlebar">
          <h2 className="window-title">
            {section === 'doc' ? 'Настройки документа' : 'Настройки редактора'}
          </h2>
          <ModalCloseButton onClose={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-1.5">
          {section === 'doc' && (
            <>
              {DOC_TOGGLES.map((t) => (
                <SettingRow key={t.key} label={t.label} desc={t.desc}>
                  <Toggle
                    label={t.label}
                    on={s[t.key] as boolean}
                    onToggle={() => onChange(t.key, !s[t.key] as never)}
                  />
                </SettingRow>
              ))}
              {s.titlePage && (
                <div className="title-fields">
                  <FieldGroup>
                    <TitleArea
                      label="Шапка титульного листа"
                      hint="Министерство, вуз, кафедра — каждая с новой строки, по центру"
                      rows={4}
                      value={s.titleHeader}
                      onChange={(v) => onChange('titleHeader', v)}
                    />
                    <div className="ui-field">
                      <span className="ui-label">Логотип вуза</span>
                      <div className="title-logo">
                        <span className="ui-hint">По центру под шапкой, до 60×40 мм</span>
                        <input
                          ref={logoRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0]
                            if (f) {
                              try { onChange('titleLogo', await addImageAsset(f)) }
                              catch (e) { window.alert(e instanceof Error ? e.message : 'Не удалось сохранить логотип') }
                            }
                            e.target.value = ''
                          }}
                        />
                        {logoSrc && <img src={logoSrc} alt="" className="title-logo-img" />}
                        {logoSrc ? (
                          <Button size="sm" onClick={() => onChange('titleLogo', '')}>Убрать</Button>
                        ) : (
                          <Button size="sm" onClick={() => logoRef.current?.click()}>Загрузить…</Button>
                        )}
                      </div>
                    </div>
                    <TitleArea
                      label="Тип работы"
                      hint="Строка ПРОПИСНЫМИ выводится крупно и полужирно, например «КУРСОВАЯ РАБОТА»"
                      rows={3}
                      value={s.titleWork}
                      onChange={(v) => onChange('titleWork', v)}
                    />
                    <TextField
                      label="Тема"
                      hint="Полужирно, в кавычках; она же — имя файла .docx"
                      value={s.topic}
                      onChange={(e) => onChange('topic', e.target.value)}
                    />
                    <TitleArea
                      label="Исполнители и принимающий"
                      hint="«Метка: текст» — метка слева, текст справа; пустая строка — отступ"
                      rows={5}
                      value={s.titlePeople}
                      onChange={(v) => onChange('titlePeople', v)}
                    />
                    <TitleArea
                      label="Внизу по центру"
                      hint="Например «Москва, 2026»"
                      rows={2}
                      value={s.titleBottom}
                      onChange={(v) => onChange('titleBottom', v)}
                    />
                  </FieldGroup>
                </div>
              )}
            </>
          )}
          {section === 'ed' && (
            <>
              <SettingRow label="Размер шрифта" desc="Моноширинный шрифт редактора">
                <div className="flex flex-shrink-0 items-center gap-3">
                  <RangeField
                    label="Размер шрифта"
                    min={EDITOR_FONT_PX_MIN}
                    max={EDITOR_FONT_PX_MAX}
                    step={1}
                    value={s.fontSize}
                    onChange={(e) => onChange('fontSize', +e.target.value)}
                    style={{ width: 120 }}
                  />
                  <span
                    className="text-right text-[12.5px] leading-none text-soft"
                    style={{ width: 36, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {s.fontSize} px
                  </span>
                </div>
              </SettingRow>
              {ED_TOGGLES.map((t) => (
                <SettingRow key={t.key} label={t.label} desc={t.desc}>
                  <Toggle
                    label={t.label}
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
