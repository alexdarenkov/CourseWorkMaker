import type { Settings } from '../lib/settings'
import { CloseIcon } from './icons'
import { SettingRow, TextField, Toggle } from './ui'

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

const TITLE_FIELDS: { key: keyof Settings; label: string }[] = [
  { key: 'university', label: 'Учебное заведение' },
  { key: 'department', label: 'Кафедра' },
  { key: 'discipline', label: 'Дисциплина' },
  { key: 'topic', label: 'Тема работы' },
  { key: 'group', label: 'Группа' },
  { key: 'student', label: 'Студент (ФИО)' },
  { key: 'supervisor', label: 'Руководитель' },
  { key: 'city', label: 'Город' },
  { key: 'year', label: 'Год' },
]

const ED_TOGGLES: { key: keyof Settings; label: string; desc: string }[] = [
  { key: 'syntaxHl', label: 'Подсветка синтаксиса', desc: 'Заголовки, жирный, код, формулы, ссылки' },
  { key: 'wordWrap', label: 'Перенос строк', desc: 'Длинные строки переносятся по ширине окна' },
  { key: 'lineNumbers', label: 'Номера строк', desc: 'Показываются при выключенном переносе строк' },
]

export function SettingsModal({ settings: s, section, onChange, onClose }: SettingsModalProps) {

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
                    Поля титульного листа
                  </div>
                  {TITLE_FIELDS.map((f) => (
                    <div key={f.key} className="mt-2.5">
                      <TextField
                        label={f.label}
                        value={s[f.key] as string}
                        onChange={(e) => onChange(f.key, e.target.value as never)}
                        className="!bg-surface"
                      />
                    </div>
                  ))}
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
        <div className="border-t border-hover px-[22px] py-3 text-[11.5px] text-faint">
          Изменения применяются к превью мгновенно
        </div>
      </div>
    </div>
  )
}
