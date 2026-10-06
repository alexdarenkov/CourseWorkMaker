export interface Settings {
  titlePage: boolean
  toc: boolean
  pageNumbers: boolean
  bibliography: boolean
  autoNumber: boolean
  /* Титульный лист — свободные блоки (каждый — многострочный текст):
     titleHeader — шапка сверху по центру (министерство/вуз/кафедра);
     titleLogo   — ключ asset-картинки логотипа (пусто — без логотипа);
     titleWork   — тип работы («КУРСОВАЯ РАБОТА…» / «Отчет по лабораторной…»);
     topic       — тема (выводится полужирной в кавычках);
     titlePeople — исполнители: строка «Метка: текст» → метка слева, текст
                   справа; строки без метки — справа; пустая строка — отступ;
     titleBottom — низ по центру (город, год). */
  titleHeader: string
  titleLogo: string
  titleWork: string
  topic: string
  titlePeople: string
  titleBottom: string
  /** Целевой объём работы в страницах — прогресс показывается в статус-баре. */
  targetPages: number
  /** 'auto' — следовать системной теме. */
  theme: 'light' | 'dark' | 'auto'
  /** Кегль моноширинного шрифта редактора, px (EDITOR_FONT_PX_MIN…MAX). */
  fontSize: number
  wordWrap: boolean
  lineNumbers: boolean
  syntaxHl: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  titlePage: true,
  toc: true,
  pageNumbers: true,
  bibliography: true,
  autoNumber: true,
  titleHeader:
    'МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ\n' +
    'Федеральное государственное бюджетное образовательное учреждение высшего образования\n' +
    'НАЦИОНАЛЬНЫЙ ИССЛЕДОВАТЕЛЬСКИЙ УНИВЕРСИТЕТ «МЭИ»\n' +
    'Кафедра прикладной математики и информатики',
  titleLogo: '',
  titleWork: 'КУРСОВАЯ РАБОТА\nпо дисциплине «Проектирование информационных систем»\nна тему:',
  topic: 'Разработка информационной системы учёта успеваемости студентов',
  titlePeople:
    'Выполнил: студент группы ИВТ-21\nСмирнова Анна Дмитриевна\n\nРуководитель: доц., канд. техн. наук Петров В. Н.',
  titleBottom: 'Москва, ' + String(new Date().getFullYear()),
  targetPages: 15,
  theme: 'light',
  fontSize: 13,
  // Перенос строк выключен по умолчанию: при переносе невидимая textarea и
  // подсвеченный pre-слой разбивают длинные строки разными движками, из-за чего
  // курсор/выделение расходятся с текстом. Без переноса строки 1:1 и совпадают.
  wordWrap: false,
  lineNumbers: false,
  syntaxHl: true,
}

/** Допустимый кегль шрифта редактора, px (целые, шаг 1). */
export const EDITOR_FONT_PX_MIN = 11
export const EDITOR_FONT_PX_MAX = 16

/** Миграция старых сохранений: титульник и кегль редактора. Новый формат
 *  возвращается тем же объектом. */
export function migrateSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const out = migrateTitle(raw)
  if (!out || typeof out !== 'object') return out
  const size = out.fontSize
  const outOfRange =
    typeof size === 'number' && Number.isFinite(size) && (size < EDITOR_FONT_PX_MIN || size > EDITOR_FONT_PX_MAX)
  if (!('editorFontPt' in out) && !outOfRange) return out
  // Кегль в pt (`editorFontPt`) недолго жил в настройках — отбрасываем, берётся
  // значение по умолчанию. Прежняя шкала px была 12…18 — приводим к 11…16,
  // а не сбрасываем из-за неё все настройки документа.
  const { editorFontPt: _dropped, ...rest } = out
  if (outOfRange) rest.fontSize = Math.min(EDITOR_FONT_PX_MAX, Math.max(EDITOR_FONT_PX_MIN, Math.round(size)))
  return rest
}

/** Миграция настроек старого формата титульника (фиксированные поля вуза/
 *  студента) в свободные блоки. Старые сохранения — localStorage и облако. */
function migrateTitle(raw: Record<string, unknown>): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || 'titleHeader' in raw) return raw
  const s = raw as Record<string, string>
  if (!('university' in s || 'student' in s || 'discipline' in s)) return raw
  const out: Record<string, unknown> = { ...raw }
  out.titleHeader = [
    'МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ',
    'Федеральное государственное бюджетное образовательное учреждение высшего образования',
    (s.university || '').toUpperCase(),
    s.department || '',
  ]
    .filter(Boolean)
    .join('\n')
  out.titleWork = [
    'КУРСОВАЯ РАБОТА',
    s.discipline ? `по дисциплине «${s.discipline}»` : '',
    'на тему:',
  ]
    .filter(Boolean)
    .join('\n')
  out.titlePeople = [
    'Выполнил: ' + (s.group ? `студент группы ${s.group}` : ''),
    s.student || '',
    '',
    'Руководитель: ' + (s.supervisor || ''),
  ].join('\n')
  out.titleBottom = [s.city, s.year].filter(Boolean).join(', ')
  return out
}

/** Поля настроек, не требующие перепагинации превью. */
export const EDITOR_ONLY_KEYS: (keyof Settings)[] = [
  'theme',
  'fontSize',
  'wordWrap',
  'lineNumbers',
  'syntaxHl',
  'targetPages',
]
