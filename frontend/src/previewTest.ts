/**
 * Dev-харнесс пагинации превью (не попадает в прод-бандл, открывается только
 * как /preview-test.html на dev-сервере).
 *
 * Рендерит страницы А4 ровно с теми же стилями, что PreviewPane, и подписывает
 * каждую страницу диагностикой: «ok» или «ПЕРЕПОЛНЕНИЕ N px» (scrollHeight
 * страницы больше её клиентской высоты — контент вылез за нижнее поле).
 * Сценарии: /preview-test.html?doc=toc|code|wide|mixed
 */

import './index.css'
import kalmanReportMd from './fixtures/kalman-report.md?raw'
import { LINE_HEIGHT } from './lib/gostRender'
import { paginate } from './lib/paginate'
import { DEFAULT_SETTINGS } from './lib/settings'

const LOREM =
  'Информационная система обрабатывает данные и формирует отчётность в согласованном формате. '

const DOCS: Record<string, string> = {
  // Содержание: много заголовков, в т.ч. очень длинные (переносятся на 2 строки).
  toc: [
    '# Введение',
    LOREM.repeat(3),
    ...Array.from({ length: 14 }, (_, i) =>
      [
        `# Очень длинное название раздела номер ${i + 1}, которое не помещается в одну строку содержания и обязано переноситься`,
        `## Подраздел с также довольно длинным названием для проверки переноса строки ${i + 1}.1`,
        `## Короткий ${i + 1}.2`,
        LOREM.repeat(6),
      ].join('\n\n'),
    ),
    '# Заключение',
    LOREM.repeat(2),
  ].join('\n\n'),

  // Листинги: длинный код с длинными строками — деление между страницами.
  code: [
    '# Разработка модуля',
    LOREM.repeat(4),
    '```python',
    ...Array.from(
      { length: 70 },
      (_, i) =>
        `def handler_${i}(request, response):  # обработчик номер ${i} с длинным-длинным комментарием, который обязан переноситься по ширине рамки листинга`,
    ),
    '```',
    LOREM.repeat(3),
    '```sql',
    'SELECT id, name, created_at, updated_at, http_endpoint_uri_with_a_very_long_unbreakable_identifier_abcdefghijklmnopqrstuvwxyz0123456789 FROM events;',
    '```',
    LOREM.repeat(3),
  ].join('\n\n'),

  // Широкая таблица + длинные слова + формула с «где» у низа страницы.
  wide: [
    '# Анализ данных',
    `Абзац с длинной ссылкой https://example.com/very/long/path/abcdefghijklmnopqrstuvwxyz0123456789/abcdefghijklmnopqrstuvwxyz0123456789/report.pdf внутри текста.`,
    'Таблица: Широкая таблица\n' +
      '| Наименование показателя | Кол-во | Идентификатор | А | Б | В | Примечание | Итог |\n' +
      '|---|---|---|---|---|---|---|---|\n' +
      Array.from(
        { length: 30 },
        (_, i) => `| Значение${i} | ${i * 7} | Оченьдлинноенеразрывноеслово${i} | ${i} | ${i * 2} | ${i * 3} | текст | ${i * 11} |`,
      ).join('\n'),
    LOREM.repeat(28),
    '$$S = \\sum_{i=1}^{n} x_i \\cdot k_i$$',
    'где S — итоговое значение; x — измерение; k — коэффициент; n — число измерений.',
    LOREM.repeat(3),
    // Формулы подряд: без свободных строк между собой, но с переносами
    // между текстом и группой формул.
    'Система уравнений задаётся следующим образом:',
    '$$x + y = 10$$',
    '$$x - y = 2$$',
    '$$2x = 12$$',
    'Абзац сразу после группы формул.',
  ].join('\n\n'),

  // Таблица как в реальной курсовой (5 колонок с многословными ячейками) —
  // проверка, что таблица не вылезает за лист по горизонтали.
  kalman: [
    '# Обзор методов оценивания',
    LOREM.repeat(2) + 'Сравнительная характеристика основных методов представлена ниже.',
    'Таблица: Сравнение методов оценивания состояния динамических систем\n' +
      '| Метод | Тип системы | Тип шума | Вычислительная сложность | Оптимальность |\n' +
      '|---|---|---|---|---|\n' +
      '| Фильтр Калмана | Линейная | Гауссовский | Низкая | Оптимален |\n' +
      '| Расширенный фильтр Калмана | Нелинейная | Гауссовский | Средняя | Субоптимален |\n' +
      '| Сигма-точечный фильтр | Нелинейная | Гауссовский | Средняя | Субоптимален |\n' +
      '| Фильтр частиц | Произвольная | Произвольный | Высокая | Асимптотически оптимален |\n' +
      '| Фильтр Винера | Линейная, стационарная | Гауссовский | Средняя | Оптимален (стационарный случай) |',
    LOREM.repeat(3),
  ].join('\n\n'),

  // Полный отчёт-курсовая (фильтр Калмана): реальный документ с формулами,
  // таблицами, mermaid-схемами и листингами — сверка раскладки с DOCX/PDF
  // (тот же файл лежит в services/converter/tests/data/kalman-report.md).
  report: kalmanReportMd,

  // Патология: таблица в 100 столбцов — что произойдёт с вёрсткой.
  monster: [
    '# Патологическая таблица',
    'Таблица: Сто столбцов\n' +
      '| ' + Array.from({ length: 100 }, (_, i) => `К${i + 1}`).join(' | ') + ' |\n' +
      '|' + '---|'.repeat(100) + '\n' +
      '| ' + Array.from({ length: 100 }, (_, i) => String(i + 1)).join(' | ') + ' |',
    'Абзац после таблицы.',
  ].join('\n\n'),

  // Смешанный: свободные строки вокруг блоков, картинки-заглушки, схема.
  mixed: [
    '# Введение',
    LOREM.repeat(3),
    '# Проектирование',
    'Список с пунктами разной длины (маркер с красной строки, продолжение пункта — от левого поля):',
    '- пункт;\n- очень длинный пункт списка, который переносится на следующую строку и растягивается выравниванием по ширине текста в документе;\n- третий пункт.',
    'Перед таблицей должна быть свободная строка.',
    'Таблица: Компактная',
    '| А | Б |\n|---|---|\n| 1 | 2 |',
    'После таблицы и перед рисунком — свободные строки.',
    'Рисунок: Заглушка изображения',
    '![Схема](placeholder)',
    'Перед листингом и после него — свободные строки.',
    '```python\nprint("короткий листинг")\n```',
    'Рисунок: Диаграмма',
    '```mermaid\nflowchart LR\n  A --> B\n```',
    'Абзац после схемы.',
    '# Заключение',
    LOREM.repeat(2),
  ].join('\n\n'),
}

// Титульник в стиле отчёта по лабораторной МАИ (?title=mai): логотип,
// несколько исполнителей, «Принял:», низ одной строкой.
const MAI_TITLE = {
  titleHeader:
    'МОСКОВСКИЙ АВИАЦИОННЫЙ ИНСТИТУТ\n(Национальный исследовательский университет)\nКафедра 301 «Системы автоматического и интеллектуального управления»',
  titleLogo:
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><circle cx="110" cy="110" r="104" fill="#0d8fd6"/><circle cx="110" cy="110" r="74" fill="#fff"/><circle cx="110" cy="110" r="44" fill="#0d8fd6"/></svg>',
    ),
  titleWork:
    'Отчет по лабораторной работе по дисциплине «Системы автоматического управления воздушными ЛА» №6 на тему:',
  topic: 'Аналитическое конструирование оптимальных регуляторов',
  titlePeople:
    'Выполнили: Полякова П. И.\nДаренков А. И.\nБайбаков А. И.\nСтуденты гр. М30-406С-22\n\nПринял: Рыбников Сергей Игоревич\nПрофессор кафедры 301',
  titleBottom: 'Москва, 2026',
}

// Стили страницы — копия pageStyle из PreviewPane.tsx.
const PAGE_CSS =
  'width:210mm;height:297mm;margin:0 auto 16px;background:#fff;position:relative;overflow:hidden;' +
  'box-shadow:0 2px 8px rgba(61,57,41,.15);border-radius:3px;padding:20mm 15mm 20mm 30mm;' +
  "font-family:'Times New Roman',Times,serif;font-size:14pt;line-height:" +
  LINE_HEIGHT +
  ';color:#000;box-sizing:border-box'

async function run() {
  await document.fonts.ready // KaTeX-шрифты влияют на высоту формул
  const params = new URLSearchParams(location.search)
  const name = params.get('doc') || 'mixed'
  // ?page=N — показать только одну страницу (для детального просмотра).
  const only = params.get('page') ? Number(params.get('page')) : null
  const md = DOCS[name] || DOCS.mixed
  let titleOverride: Partial<typeof DEFAULT_SETTINGS> = {}
  if (params.get('title') === 'mai') titleOverride = MAI_TITLE
  let { pages } = paginate(md, { ...DEFAULT_SETTINGS, ...titleOverride }, () => null)
  if (only) pages = pages.filter((_, i) => i + 1 === only)
  const root = document.getElementById('root')!
  root.innerHTML = ''
  // ?measure=1 — точный замер (getBoundingClientRect) позиции маркера списка
  // и абзацного отступа обычного текста на РЕАЛЬНО отрендеренной странице
  // (продовый renderAll/paginate), а не в изолированном макете.
  if (params.get('measure')) {
    queueMicrotask(() => {
      const mmpx = 96 / 25.4
      const report = document.createElement('pre')
      report.style.cssText = 'font:14px monospace;background:#fff;padding:10px;margin:10px'
      const lines: string[] = []
      for (const page of Array.from(root.children) as HTMLElement[]) {
        const pageLeft = page.getBoundingClientRect().left
        const para = page.querySelector<HTMLElement>('div[style*="text-indent:12.5mm"]')
        // Пункт списка теперь верстается как обычный абзац с красной строки:
        // ищем div, чей текст начинается с маркера, и меряем позицию первого
        // символа (Range) — маркер должен стоять на 12.5мм.
        const listItem = Array.from(page.querySelectorAll<HTMLElement>('div')).find((d) =>
          /^([–—]|\d+\))\u00a0/.test(d.textContent || ''),
        )
        if (para) {
          const r = para.getBoundingClientRect()
          lines.push('абзац (div box left, БЕЗ учёта text-indent) = ' + ((r.left - pageLeft) / mmpx).toFixed(2) + 'мм')
        }
        if (listItem && listItem.firstChild) {
          const range = document.createRange()
          range.setStart(listItem.firstChild, 0)
          range.setEnd(listItem.firstChild, 1)
          const mr = range.getBoundingClientRect()
          const ir = listItem.getBoundingClientRect()
          lines.push('маркер списка (первый символ)        = ' + ((mr.left - pageLeft) / mmpx).toFixed(2) + 'мм (ожидание 12.5)')
          lines.push('div списка (box left, ожидание 0)    = ' + ((ir.left - pageLeft) / mmpx).toFixed(2) + 'мм')
        }
        if (para || listItem) break
      }
      report.textContent = lines.join('\n') || 'элементы не найдены на видимых страницах'
      root.prepend(report)
    })
  }
  // ?debug=1 — под каждой страницей печатается список её блоков с реальными
  // высотами (в мм): диагностика расхождений пагинации с DOCX/PDF.
  const debug = !!params.get('debug')
  let overflowTotal = 0
  pages.forEach((p, i) => {
    const page = document.createElement('div')
    page.setAttribute('style', PAGE_CSS)
    page.innerHTML = p.html
    root.appendChild(page)
    if (debug) {
      const rep = document.createElement('pre')
      rep.style.cssText = 'font:11px monospace;background:#ffe;padding:6px;margin:4px auto;width:210mm;white-space:pre-wrap'
      const mmpx = 96 / 25.4
      rep.textContent = Array.from(page.children)
        .map((c) => {
          const el = c as HTMLElement
          const h = el.getBoundingClientRect().height / mmpx
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
          return h.toFixed(1).padStart(6) + 'мм | ' + (t || '(пусто)')
        })
        .join('\n')
      root.appendChild(rep)
    }
    const over = page.scrollHeight - page.clientHeight
    const overX = page.scrollWidth - page.clientWidth
    if (over > 0 || overX > 0) overflowTotal++
    const label = document.createElement('div')
    label.textContent =
      `сценарий «${name}» · страница ${i + 1}/${pages.length}` +
      (over > 0 ? ` — ПЕРЕПОЛНЕНИЕ ${over}px по вертикали` : '') +
      (overX > 0 ? ` — ПЕРЕПОЛНЕНИЕ ${overX}px по горизонтали` : '') +
      (over <= 0 && overX <= 0 ? ' — ok' : '')
    label.setAttribute(
      'style',
      `font:bold 14px monospace;color:${over > 0 ? '#c00' : '#171'};margin:6px auto 22px;width:210mm`,
    )
    root.insertBefore(label, page)
  })
  const summary = document.createElement('div')
  summary.id = 'summary'
  summary.textContent = overflowTotal
    ? `ИТОГ: переполнено страниц — ${overflowTotal}`
    : 'ИТОГ: переполнений нет'
  summary.setAttribute('style', `font:bold 16px monospace;color:${overflowTotal ? '#c00' : '#171'};margin:10px`)
  root.prepend(summary)
}

run()
