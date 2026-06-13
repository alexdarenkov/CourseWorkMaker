export interface Settings {
  titlePage: boolean
  toc: boolean
  pageNumbers: boolean
  bibliography: boolean
  autoNumber: boolean
  university: string
  department: string
  discipline: string
  topic: string
  group: string
  student: string
  supervisor: string
  city: string
  year: string
  theme: 'light' | 'dark'
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
  university: 'Национальный исследовательский университет «МЭИ»',
  department: 'Кафедра прикладной математики и информатики',
  discipline: 'Проектирование информационных систем',
  topic: 'Разработка информационной системы учёта успеваемости студентов',
  group: 'ИВТ-21',
  student: 'Смирнова Анна Дмитриевна',
  supervisor: 'доц., канд. техн. наук Петров В. Н.',
  city: 'Москва',
  year: String(new Date().getFullYear()),
  theme: 'light',
  fontSize: 14,
  wordWrap: true,
  lineNumbers: false,
  syntaxHl: true,
}

/** Поля настроек, влияющие только на редактор (не требуют перепагинации превью). */
export const EDITOR_ONLY_KEYS: (keyof Settings)[] = [
  'theme',
  'fontSize',
  'wordWrap',
  'lineNumbers',
  'syntaxHl',
]

export interface User {
  id: string
  name: string
  email: string
}
