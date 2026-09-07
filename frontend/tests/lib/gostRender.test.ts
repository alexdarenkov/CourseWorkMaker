/**
 * Оформление превью по ГОСТ 7.32-2017 (выписка «Структура и правила
 * оформления») и парность с конвертером (services/converter/app/gost.py):
 * каждая проверка здесь имеет зеркальную проверку в
 * services/converter/tests/test_gost_layout.py.
 *
 * Реальная раскладка страниц (offsetHeight) в jsdom-средах не считается —
 * вёрстку проверяет dev-харнесс preview-test.html в настоящем Chrome.
 */
import { describe, expect, it } from 'vitest'
import kalmanReport from '../../src/fixtures/kalman-report.md?raw'
import {
  buildTocRow,
  LINE_HEIGHT,
  LINE_HEIGHT_CODE,
  LINE_HEIGHT_SINGLE,
  LINE_PT,
  renderAll,
  TOC_HEADER_HTML,
  type RenderedBlock,
} from '../../src/lib/gostRender'
import { parseMD, splitGde, stripHeadingNumber } from '../../src/lib/markdown'
import { pngWithDpi } from '../../src/lib/mermaidRenderer'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'

const S = DEFAULT_SETTINGS

function render(md: string) {
  return renderAll(parseMD(md), S, () => null)
}

describe('метрики строки (парность с gost.py)', () => {
  it('полуторный интервал Word: 14пт × 1.725 = 24.15пт (LINE_PT в gost.py)', () => {
    expect(Number(LINE_HEIGHT) * 14).toBeCloseTo(24.15, 5)
    expect(LINE_PT).toBe('24.15pt')
  })

  it('листинг Courier New 12пт: 12 × 1.7 = 20.4пт (как в PDF LibreOffice)', () => {
    expect(Number(LINE_HEIGHT_CODE) * 12).toBeCloseTo(20.4, 5)
  })

  it('одинарный интервал (подписи рисунков) — собственная высота строки', () => {
    expect(Number(LINE_HEIGHT_SINGLE)).toBeCloseTo(1.15, 5)
  })
})

describe('парсер markdown', () => {
  it('срезает ручной номер и хвостовую точку заголовка', () => {
    expect(stripHeadingNumber('1.2 Обзор решений.')).toBe('Обзор решений')
    expect(stripHeadingNumber('Приложение А. Листинг кода')).toBe('Приложение А. Листинг кода')
    const blocks = parseMD('# Введение.\n\nТекст.')
    expect(blocks[0]).toMatchObject({ type: 'h1', text: 'Введение' })
  })

  it('пояснение «где …» делится по «;» на строки', () => {
    expect(splitGde('где S — площадь; h — высота.')).toEqual(['где S — площадь;', 'h — высота.'])
    expect(splitGde('обычный абзац')).toBeNull()
  })

  it('заголовок съедает пустые строки после себя (парность с _drop_blank_after_heading)', () => {
    // Любое число пустых строк после заголовка не даёт пустого абзаца между ним
    // и текстом — интервал задаёт стиль заголовка (space_after), не переносы.
    const types = parseMD('## Подраздел\n\n\n\nТекст.').map((b) => b.type)
    expect(types).toEqual(['h2', 'p'])
    // Но пустые абзацы ВНУТРИ текста (между обычными абзацами) сохраняются.
    const between = parseMD('Абзац один.\n\n\nАбзац два.').map((b) => b.type)
    expect(between).toEqual(['p', 'blank', 'p'])
  })
})

describe('заголовки', () => {
  it('структурный заголовок — прописными по центру, с новой страницы, без доп. отступов', () => {
    const { out } = render('# Введение\n\nТекст.')
    const h = out.find((b) => b.isHeading)!
    expect(h.breakBefore).toBe(true)
    expect(h.html).toContain('ВВЕДЕНИЕ')
    expect(h.html).toContain('text-align:center')
    expect(h.html).not.toContain('padding')
  })

  it('раздел нумеруется, с абзацного отступа, полужирный', () => {
    const { out } = render('# Обзор методов\n\nТекст.')
    const h = out.find((b) => b.isHeading)!
    expect(h.html).toContain('1&nbsp;Обзор методов')
    expect(h.html).toContain('text-indent:12.5mm')
    expect(h.html).toContain('font-weight:bold')
  })

  it('h2/h3 — обычные строки 1.5: без спейсеров/padding вокруг, без разрядки', () => {
    const { out } = render('# Раздел\n\nАбзац.\n\n## Подраздел\n\nТекст.\n\n### Пункт\n\nЕщё.')
    const h2 = out.find((b) => b.html.includes('1.1&nbsp;Подраздел'))!
    const h3 = out.find((b) => b.html.includes('1.1.1&nbsp;Пункт'))!
    for (const h of [h2, h3]) {
      expect(h.html).not.toContain('padding')
      expect(h.html).not.toContain('letter-spacing')
      // Между текстом и подзаголовком нет спейсера — предыдущий блок это
      // сам текст (space_before/space_after = 0 у Heading 2/3 в DOCX).
      const prev = out[out.indexOf(h) - 1]
      expect(prev.isBlank).toBeUndefined()
      expect(prev.html).not.toContain('height:')
    }
  })
})

describe('перечисления и список источников', () => {
  it('маркеры: тире и «N)» со сквозной нумерацией, с красной строки без висячего отступа', () => {
    const { out } = render('- пункт;\n\n1. раз;\n\n1. два.')
    const html = out.map((b) => b.html).join('\n')
    expect(html).toContain('–&nbsp;пункт')
    expect(html).toContain('1)&nbsp;раз')
    expect(html).toContain('2)&nbsp;два') // сквозная нумерация через пустые строки
    // Пункт — как абзац с красной строки: продолжение переносится к левому
    // полю (нет висячего отступа: ни padding-left, ни отрицательного indent).
    const item = out.find((b) => b.html.includes('–&nbsp;пункт'))!
    expect(item.html).toContain('text-indent:12.5mm')
    expect(item.html).not.toContain('padding-left')
  })

  it('источники: номер С точкой, с абзацного отступа, без висячего отступа', () => {
    const { out } = render('# Список использованных источников\n\n1. Иванов И. И. Книга.')
    const item = out.find((b) => b.html.includes('Иванов'))!
    expect(item.html).toContain('1.&nbsp;Иванов')
    expect(item.html).toContain('text-indent:12.5mm')
    expect(item.html).not.toContain('padding-left:20mm')
  })
})

describe('рисунки, таблицы, листинги, формулы', () => {
  it('подпись рисунка «Рисунок N – …» одинарным интервалом, свободные строки вокруг', () => {
    const { out, ctx } = render('Рисунок: Схема установки\n![Схема](placeholder)')
    const fig = out.find((b) => b.html.includes('Рисунок 1 – Схема установки'))!
    expect(fig.html).toContain('line-height:' + LINE_HEIGHT_SINGLE)
    expect(out[out.indexOf(fig) - 1].isBlank).toBe(true)
    expect(out[out.indexOf(fig) + 1].isBlank).toBe(true)
    expect(ctx.fig).toBe(1)
  })

  it('подпись таблицы слева над таблицей; таблица во всю ширину с интервалом Word', () => {
    const { out } = render('Таблица: Сравнение\n| А | Б |\n|---|---|\n| 1 | 2 |')
    const tbl = out.find((b) => b.table)!
    expect(tbl.table!.caption).toContain('Таблица 1 – Сравнение')
    // Подпись — одинарным интервалом (многострочная — через один интервал),
    // вплотную к таблице (в DOCX line_spacing=1.0, space_after=0).
    expect(tbl.table!.caption).toContain('line-height:' + LINE_HEIGHT_SINGLE)
    expect(tbl.table!.openTag).toContain('width:100%')
    expect(tbl.table!.openTag).toContain('line-height:' + LINE_HEIGHT)
    expect(tbl.table!.openTag).toContain('font-size:14pt')
  })

  it('таблица шире 6 колонок — кегль 12пт (как в конвертере)', () => {
    const cols = Array.from({ length: 8 }, (_, i) => 'К' + i)
    const md =
      'Таблица: Ш\n| ' + cols.join(' | ') + ' |\n|' + '---|'.repeat(8) + '\n| ' +
      cols.map((_, i) => i).join(' | ') + ' |'
    const { out } = render(md)
    expect(out.find((b) => b.table)!.table!.openTag).toContain('font-size:12pt')
  })

  it('листинг: Courier с интервалом Word; «жёсткая» строка до, гасимая после', () => {
    const { out } = render('Текст.\n\n```python\nprint(1)\n```\n\nПосле.')
    const code = out.find((b) => b.split && b.html.includes('print'))!
    expect(code.html).toContain('line-height:' + LINE_HEIGHT_CODE)
    const before = out[out.indexOf(code) - 1]
    const after = out[out.indexOf(code) + 1]
    // До листинга — настоящий пустой абзац DOCX (спейсер) — не гасится.
    expect(before.html).toContain('&nbsp;')
    expect(before.isBlank).toBeUndefined()
    expect(after.isBlank).toBe(true)
  })

  it('формулы: номер (N) справа, подряд — без свободных строк между собой', () => {
    const { out, ctx } = render('До.\n\n$$a=1$$\n\n$$b=2$$\n\nПосле.')
    const html = out.map((b) => b.html).join('\n')
    expect(html).toContain('(1)')
    expect(html).toContain('(2)')
    const f1 = out.findIndex((b) => b.html.includes('(1)'))
    const f2 = out.findIndex((b) => b.html.includes('(2)'))
    expect(f2).toBe(f1 + 1) // между формулами нет blank-блока
    expect(out[f1 - 1].isBlank).toBe(true)
    expect(out[f2 + 1].isBlank).toBe(true)
    expect(ctx.form).toBe(2)
  })

  it('пояснение «где …»: не отрывается от формулы, каждое — с красной строки', () => {
    const { out } = render('$$E=mc^2$$\n\nгде E — энергия; m — масса.')
    const f = out.find((b) => b.html.includes('(1)'))!
    expect(f.keepNext).toBe(true)
    // Каждое пояснение — отдельный делимый абзац с абзацным отступом;
    // длинное тире «—» приводится к среднему «–» (правило inline()).
    const g1 = out[out.indexOf(f) + 1]
    const g2 = out[out.indexOf(f) + 2]
    expect(g1.html).toContain('text-indent:12.5mm')
    expect(g1.html).toContain('>где E – энергия;</div>')
    expect(g1.split).toBeDefined()
    expect(g2.html).toContain('text-indent:12.5mm')
    expect(g2.html).toContain('>m – масса.</div>')
    // После пояснений — свободная строка (ГОСТ 6.8).
    expect(out[out.indexOf(f) + 3].isBlank).toBe(true)
  })

  it('пользовательская пустая строка — «жёсткая» (не гасится в начале страницы)', () => {
    const { out } = render('Первый.\n\n\n\nВторой.')
    const blanks = out.filter((b) => b.html.includes('&nbsp;'))
    expect(blanks.length).toBe(2)
    expect(blanks.every((b) => !b.isBlank)).toBe(true)
  })
})

describe('содержание', () => {
  it('отступы записей: раздел 0, подраздел 0.5см, пункт 1см; интервал Word', () => {
    expect(buildTocRow({ label: 'ВВЕДЕНИЕ', level: 1, page: 3 }, '3')).toContain('padding-left:0mm')
    expect(buildTocRow({ label: '1.1 Обзор', level: 2, page: 4 }, '4')).toContain('padding-left:5mm')
    expect(buildTocRow({ label: '1.1.1 Пункт', level: 3, page: 5 }, '5')).toContain('padding-left:10mm')
    expect(buildTocRow({ label: 'ВВЕДЕНИЕ', level: 1, page: 3 }, '3')).toContain(
      'line-height:' + LINE_HEIGHT,
    )
  })

  it('«СОДЕРЖАНИЕ» — обычная строка 1.5 без доп. отступа (как Heading 1 в DOCX)', () => {
    expect(TOC_HEADER_HTML).not.toContain('padding')
  })
})

describe('pHYs для mermaid-PNG', () => {
  // 1×1 PNG без pHYs (тот же, что в тестах конвертера).
  const TINY =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  it('вписывает плотность: конвертер прочитает те же мм, что показывает превью', () => {
    const out = pngWithDpi(TINY, 240)
    const bytes = Uint8Array.from(atob(out), (c) => c.charCodeAt(0))
    const ascii = String.fromCharCode(...bytes)
    const at = ascii.indexOf('pHYs')
    expect(at).toBe(37) // сразу после IHDR (33) + длина чанка (4)
    const dv = new DataView(bytes.buffer)
    const ppm = dv.getUint32(at + 4)
    expect(ppm).toBe(Math.round(240 / 0.0254)) // 9449 пикселей на метр
    expect(dv.getUint32(33)).toBe(9) // длина данных pHYs
  })

  it('не портит не-PNG вход', () => {
    expect(pngWithDpi('AAAA', 96)).toBe('AAAA')
  })
})

describe('полный отчёт (фикстура, копия services/converter/tests/data/kalman-report.md)', () => {
  it('нумерация сквозная: 10 рисунков, 5 таблиц, 15 формул; реферата нет', () => {
    const { ctx } = render(kalmanReport)
    expect(ctx.fig).toBe(10) // 5 mermaid + 5 картинок
    expect(ctx.tab).toBe(5)
    expect(ctx.form).toBe(15)
    expect(ctx.headings[0].label).toBe('ВВЕДЕНИЕ')
    expect(ctx.headings.filter((h) => h.level === 1).length).toBe(9)
  })

  it('структурные разделы фикстуры оформлены прописными', () => {
    const { ctx } = render(kalmanReport)
    const labels = ctx.headings.map((h) => h.label)
    expect(labels).toContain('ЗАКЛЮЧЕНИЕ')
    expect(labels).toContain('СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ')
    expect(labels).toContain('ПРИЛОЖЕНИЕ А. ЛИСТИНГ КОДА')
    expect(labels).toContain('1 Теоретические основы оптимальной фильтрации')
  })
})

// Тип используется в сигнатурах выше — проверка, что экспорт не сломан.
const _typecheck: RenderedBlock | null = null
void _typecheck

describe('метки строк исходника в выводе (адреса каретки в превью)', () => {
  // Пункт спеки для каретки в превью ещё не заведён — когда появится, ID
  // нужно проставить в название describe.
  const MD = [
    '# Раздел', // 0
    '', // 1
    'Абзац.', // 2
    '', // 3
    'Таблица: Сравнение', // 4
    '| A | B |', // 5
    '|---|---|', // 6
    '| 1 | 2 |', // 7
    '', // 8
    'Рисунок: Схема', // 9
    '```mermaid', // 10
    'flowchart LR', // 11
    '```', // 12
    '', // 13
    '- первый', // 14
    '- второй', // 15
  ].join('\n')

  it('блок помечен строкой, в которой он написан', () => {
    const out = render(MD).out
    expect(out[0].html).toContain('data-l="0"')
    expect(out[1].html).toContain('data-l="2"')
  })

  it('подпись рисунка помечена СВОЕЙ строкой, а не строкой блока', () => {
    const fig = render(MD).out.find((b) => b.html.includes('Рисунок 1'))!
    // Сам блок — строка ```mermaid, подпись — строка «Рисунок: …» выше.
    expect(fig.html).toContain('data-l="10"')
    expect(fig.html).toContain('data-l="9" style="line-height:' + LINE_HEIGHT_SINGLE + '"')
  })

  it('подпись таблицы помечена своей строкой', () => {
    const tbl = render(MD).out.find((b) => b.table)!
    expect(tbl.table!.caption).toContain('data-l="4"')
  })

  it('каждая строка таблицы помечена своей строкой исходника', () => {
    const tbl = render(MD).out.find((b) => b.table)!
    expect(tbl.table!.headHtml).toContain('<tr data-l="5">')
    // Разделитель «|---|» в вывод не идёт: у первой строки тела — строка 7.
    expect(tbl.table!.rows[0]).toContain('<tr data-l="7">')
  })

  it('пункты перечисления помечены каждый своей строкой', () => {
    const out = render(MD).out
    expect(out.find((b) => b.html.includes('первый'))!.html).toContain('data-l="14"')
    expect(out.find((b) => b.html.includes('второй'))!.html).toContain('data-l="15"')
  })

  it('пояснение «где …» помечено своей строкой, а не строкой формулы', () => {
    // Пояснение рендерится ВНУТРИ обработки формулы (она съедает его блок) —
    // без явной пометки оно получало строку формулы, и каретка на нём
    // не находила своего элемента.
    const out = render('$$E = mc^2$$\nгде E — энергия').out
    expect(out.find((b) => b.html.includes('E = mc'))!.line).toBe(0)
    expect(out.find((b) => b.html.includes('энергия'))!.html).toContain('data-l="1"')
  })

  it('делимый блок несёт метку и в обёртке продолжения (разрез между страницами)', () => {
    const code = render('```python\nx = 1\n```').out.find((b) => b.split)!
    expect(code.split!.openFirst).toContain('data-l="0"')
    expect(code.split!.openCont).toContain('data-l="0"')
  })

  it('служебная свободная строка метки не несёт, пользовательская — несёт', () => {
    const out = render(MD).out
    const service = out.filter((b) => b.isBlank)
    expect(service.length).toBeGreaterThan(0)
    service.forEach((b) => expect(b.html).not.toContain('data-l'))
    // Двойной перенос — пустая строка пользователя: у неё своя строка.
    const user = render('Абзац.\n\n\nВторой.').out.find(
      (b) => b.html.includes('&nbsp;') && !b.isBlank,
    )!
    expect(user.html).toContain('data-l="1"')
  })
})
