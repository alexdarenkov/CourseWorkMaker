/**
 * Диалект Markdown (docs/specs/markdown-dialect.md): блочная модель парсера.
 * Парность: services/converter/app/md_parser.py (тесты test_converter.py).
 * stripHeadingNumber, splitGde и «заголовок съедает пустые строки» уже покрыты
 * в gostRender.test.ts — здесь не дублируются.
 */
import { describe, expect, it } from 'vitest'
import { esc, inline, isStructural, parseMD } from '../../src/lib/markdown'

describe('MD-2: структурные заголовки', () => {
  it('распознаёт структурные слова регистронезависимо', () => {
    expect(isStructural('Введение')).toBe(true)
    expect(isStructural('ЗАКЛЮЧЕНИЕ')).toBe(true)
    expect(isStructural('Список использованных источников')).toBe(true)
    expect(isStructural('Приложение А. Листинг кода')).toBe(true)
    expect(isStructural('  реферат')).toBe(true)
  })

  it('обычный заголовок — не структурный', () => {
    expect(isStructural('Обзор решений')).toBe(false)
    expect(isStructural('Анализ введения данных')).toBe(false)
  })
})

describe('MD-4: уровни заголовков', () => {
  it('## → h2, ### → h3', () => {
    expect(parseMD('## Подраздел')[0]).toMatchObject({ type: 'h2', text: 'Подраздел' })
    expect(parseMD('### Пункт')[0]).toMatchObject({ type: 'h3', text: 'Пункт' })
  })

  it('уровни 4+ приводятся к h3, ручной номер срезается', () => {
    expect(parseMD('#### 4.3.1 Алгоритм')[0]).toMatchObject({ type: 'h3', text: 'Алгоритм' })
    expect(parseMD('###### Глубокий')[0]).toMatchObject({ type: 'h3', text: 'Глубокий' })
  })
})

describe('MD-5: таблицы и подпись «Таблица:»', () => {
  it('строка «Таблица: Название» перед GFM-таблицей становится подписью', () => {
    const blocks = parseMD('Таблица: Сравнение\n| А | Б |\n|---|---|\n| 1 | 2 |')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'table',
      caption: 'Сравнение',
      rows: [
        ['А', 'Б'],
        ['1', '2'],
      ],
    })
  })

  it('таблица без строки-подписи — caption null, строка-разделитель отфильтрована', () => {
    const blocks = parseMD('| А | Б |\n|:--|--:|\n| 1 | 2 |')
    expect(blocks[0]).toMatchObject({ type: 'table', caption: null })
    expect((blocks[0] as { rows: string[][] }).rows).toHaveLength(2)
  })
})

describe('MD-6: подпись «Рисунок:»', () => {
  it('перед ![…](…) даёт caption рисунка', () => {
    const blocks = parseMD('Рисунок: Схема системы\n![альт](asset:img-1)')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'figure',
      alt: 'альт',
      src: 'asset:img-1',
      caption: 'Схема системы',
    })
  })

  it('перед ```mermaid даёт caption диаграммы (MD-9)', () => {
    const blocks = parseMD('Рисунок: Потоки данных\n```mermaid\ngraph TD\nA-->B\n```')
    expect(blocks[0]).toMatchObject({
      type: 'mermaid',
      caption: 'Потоки данных',
      code: 'graph TD\nA-->B',
    })
  })
})

describe('MD-7: формулы', () => {
  it('$$…$$ в одну строку → выключная формула', () => {
    expect(parseMD('$$E=mc^2$$')[0]).toMatchObject({ type: 'math', code: 'E=mc^2' })
  })

  it('многострочная $$ … $$ собирается целиком', () => {
    const blocks = parseMD('$$\n\\frac{a}{b}\n= c\n$$')
    expect(blocks[0]).toMatchObject({ type: 'math', code: '\\frac{a}{b}\n= c' })
  })

  it('inline-формула $…$ рендерится KaTeX внутри строки', () => {
    expect(inline('масса $m_0$ покоя')).toContain('katex')
  })
})

describe('MD-8: листинги', () => {
  it('```lang → блок кода с языком, содержимое дословно', () => {
    const blocks = parseMD('```python\ndef f():\n    return 1\n```')
    expect(blocks[0]).toMatchObject({
      type: 'code',
      lang: 'python',
      code: 'def f():\n    return 1',
    })
  })
})

describe('MD-10: списки', () => {
  it('«- пункт» → маркированный список', () => {
    expect(parseMD('- один\n- два')[0]).toMatchObject({ type: 'ul', items: ['один', 'два'] })
  })

  it('«1. пункт» и «1) пункт» → нумерованный список', () => {
    expect(parseMD('1. один\n2) два')[0]).toMatchObject({ type: 'ol', items: ['один', 'два'] })
  })
})

describe('MD-12: разрыв страницы', () => {
  it('«---» и «***» → pagebreak', () => {
    expect(parseMD('---')[0]).toMatchObject({ type: 'pagebreak' })
    expect(parseMD('***')[0]).toMatchObject({ type: 'pagebreak' })
  })
})

describe('MD-13: переносы строк (breaks:true)', () => {
  it('перенос строки в редакторе сохраняется в тексте абзаца', () => {
    const blocks = parseMD('строка один\nстрока два')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'p', text: 'строка один\nстрока два' })
  })

  it('хвостовой «\\» срезается, перенос остаётся', () => {
    expect(parseMD('альфа \\\nбета')[0]).toMatchObject({ type: 'p', text: 'альфа\nбета' })
  })

  it('inline() превращает \\n в <br>', () => {
    expect(inline('а\nб')).toBe('а<br>б')
  })
})

describe('MD-14: пустые строки', () => {
  it('одна пустая строка разделяет абзацы без пустого блока', () => {
    expect(parseMD('Абзац один.\n\nАбзац два.').map((b) => b.type)).toEqual(['p', 'p'])
  })

  it('каждая лишняя пустая строка даёт blank-блок', () => {
    expect(parseMD('Абзац.\n\n\n\nДругой.').map((b) => b.type)).toEqual(['p', 'blank', 'blank', 'p'])
  })
})

describe('MD-15: цитата', () => {
  it('строки «>» склеиваются в один блок цитаты', () => {
    expect(parseMD('> Первая строка\n> вторая строка')[0]).toMatchObject({
      type: 'quote',
      text: 'Первая строка вторая строка',
    })
  })
})

describe('MD-16: изображения', () => {
  it('внешний URL и asset-ключ сохраняются в src', () => {
    expect(parseMD('![график](https://example.com/a.png)')[0]).toMatchObject({
      type: 'figure',
      src: 'https://example.com/a.png',
      caption: null,
    })
    expect(parseMD('![](asset:img-42)')[0]).toMatchObject({ type: 'figure', alt: '', src: 'asset:img-42' })
  })
})

describe('inline-разметка', () => {
  it('жирный/курсив/подчёркнутая ссылка', () => {
    expect(inline('**ж** и *к*')).toBe('<b>ж</b> и <i>к</i>')
    expect(inline('[текст](https://x)')).toBe('<span style="text-decoration:underline">текст</span>')
  })

  it('inline-код — Courier New 13пт, содержимое экранируется', () => {
    const out = inline('`a < b`')
    expect(out).toContain('Courier New')
    expect(out).toContain('a &lt; b')
  })

  it('длинное тире — заменяется на среднее –, но не внутри кода', () => {
    expect(inline('было — стало')).toBe('было – стало')
    expect(inline('`а — б`')).toContain('а — б')
  })

  it('esc экранирует спецсимволы HTML', () => {
    expect(esc('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;')
  })
})

describe('Номер исходной строки в блоках (якоря синхронной прокрутки)', () => {
  // Пункт спеки для синхронной прокрутки ещё не заведён — когда появится,
  // ID нужно проставить в название describe.
  const MD = [
    '# Введение', // 0
    '', // 1
    'Первый абзац.', // 2
    '', // 3
    '', // 4
    '```python', // 5
    'x = 1', // 6
    '```', // 7
    '', // 8
    'Таблица: Данные', // 9
    '| A | B |', // 10
    '|---|---|', // 11
    '| 1 | 2 |', // 12
    '', // 13
    '- пункт', // 14
    '- пункт', // 15
  ].join('\n')

  it('каждый блок помечен строкой, с которой он начинается', () => {
    expect(parseMD(MD).map((b) => [b.line, b.type])).toEqual([
      [0, 'h1'],
      [2, 'p'],
      // Прогон пустых строк 3–4: лишняя пустая помечена началом прогона.
      [3, 'blank'],
      // Многострочные блоки — строкой открывающего маркера, а не последней.
      [5, 'code'],
      // Строка-подпись «Таблица: …» сама блока не даёт: таблица помечена
      // первой строкой самой таблицы.
      [10, 'table'],
      [14, 'ul'],
    ])
  })

  it('номера строк строго возрастают — иначе якоря не отсортированы', () => {
    const lines = parseMD(MD).map((b) => b.line!)
    for (let i = 1; i < lines.length; i++) expect(lines[i]).toBeGreaterThan(lines[i - 1])
  })

  it('пустой документ блоков не даёт', () => {
    expect(parseMD('')).toEqual([])
  })

  it('блок знает свою последнюю строку', () => {
    const b = parseMD(MD)
    expect(b[3]).toMatchObject({ type: 'code', line: 5, endLine: 7 })
    expect(b[4]).toMatchObject({ type: 'table', endLine: 12 })
    expect(b[5]).toMatchObject({ type: 'ul', line: 14, endLine: 15 })
  })

  it('подпись «Таблица:/Рисунок:» помнит свою строку', () => {
    const t = parseMD(MD).find((b) => b.type === 'table')!
    expect(t.captionLine).toBe(9)
    const fig = parseMD('Рисунок: Схема\n```mermaid\nflowchart LR\n```')
    expect(fig[0]).toMatchObject({ type: 'mermaid', line: 1, captionLine: 0 })
  })

  it('без подписи captionLine не проставляется', () => {
    expect(parseMD('| A |\n|---|\n| 1 |')[0].captionLine).toBeUndefined()
  })

  it('строки таблицы и пункты перечисления знают свои строки исходника', () => {
    const t = parseMD(MD).find((b) => b.type === 'table')!
    // Разделитель «|---|» выброшен, поэтому номера не подряд.
    expect(t.rowLines).toEqual([10, 12])
    expect(parseMD(MD).find((b) => b.type === 'ul')!.itemLines).toEqual([14, 15])
  })
})
