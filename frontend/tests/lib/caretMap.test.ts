/**
 * Положение каретки редактора в тексте превью (lib/caretMap.ts): строка,
 * колонка и смещение в символах внутри блока.
 *
 * Пункт спеки для этой фичи ещё не заведён — когда появится, ID нужно
 * проставить в названия describe.
 *
 * Координаты каретки берутся из Range по отрендеренному тексту (хук
 * useCaretMarker) — их happy-dom не считает; здесь проверяется арифметика,
 * которая эти координаты адресует.
 */
import { describe, expect, it } from 'vitest'
import {
  caretColumn,
  caretLine,
  caretTextOffset,
  cellAt,
  codeTextOffset,
  scanText,
  lineMarkerLength,
  mathGlyphs,
  mathPrefix,
  mermaidLabelAt,
  textPosAt,
  visibleText,
} from '../../src/lib/caretMap'

describe('caretMap: строка и колонка каретки', () => {
  const MD = 'первая\nвторая\nтретья'

  it('строка считается по числу переносов до позиции', () => {
    expect(caretLine(MD, 0)).toBe(0)
    expect(caretLine(MD, 6)).toBe(0)
    expect(caretLine(MD, 7)).toBe(1)
    expect(caretLine(MD, MD.length)).toBe(2)
  })

  it('колонка — расстояние от начала своей строки', () => {
    expect(caretColumn(MD, 0)).toBe(0)
    expect(caretColumn(MD, 6)).toBe(6)
    expect(caretColumn(MD, 7)).toBe(0)
    expect(caretColumn(MD, 10)).toBe(3)
  })

  it('позиция за пределами текста не ломает счёт', () => {
    expect(caretLine(MD, 9999)).toBe(2)
    expect(caretLine(MD, -1)).toBe(0)
    expect(caretColumn(MD, -1)).toBe(0)
    expect(caretLine('', 0)).toBe(0)
  })
})

describe('caretMap: видимый текст строки', () => {
  it('снимает inline-разметку, оставляя содержимое', () => {
    expect(visibleText('обычный текст')).toBe('обычный текст')
    expect(visibleText('**жирный** и *курсив*')).toBe('жирный и курсив')
    expect(visibleText('код `x = 1` внутри')).toBe('код x = 1 внутри')
    expect(visibleText('ссылка [текст](http://a.b) дальше')).toBe('ссылка текст дальше')
    expect(visibleText('формула $E=mc^2$ здесь')).toBe('формула E=mc^2 здесь')
  })

  it('длина видимого текста короче исходной ровно на маркеры', () => {
    expect(visibleText('**слово**').length).toBe('слово'.length)
  })
})

describe('caretMap: маркер в начале строки', () => {
  it('считает длину маркера заголовка, перечисления и цитаты', () => {
    expect(lineMarkerLength('# Введение')).toBe(2)
    expect(lineMarkerLength('### Пункт')).toBe(4)
    expect(lineMarkerLength('- пункт')).toBe(2)
    expect(lineMarkerLength('1. пункт')).toBe(3)
    expect(lineMarkerLength('> цитата')).toBe(2)
  })

  it('у обычного текста маркера нет', () => {
    expect(lineMarkerLength('обычный абзац')).toBe(0)
    expect(lineMarkerLength('')).toBe(0)
  })
})

describe('caretMap: смещение каретки внутри блока', () => {
  const LINES = ['Первая строка.', 'Вторая строка.', 'Третья.']

  it('в первой строке блока смещение равно колонке', () => {
    expect(caretTextOffset(LINES, 0, 0, 6)).toBe(6)
  })

  it('следующие строки блока добавляют свою длину', () => {
    // «Первая строка.» (14) + 6 символов второй строки. Перенос внутри абзаца
    // выводится тегом <br> и символом текста не является.
    expect(caretTextOffset(LINES, 0, 1, 6)).toBe(14 + 6)
  })

  it('маркер строки в смещение не входит', () => {
    // «# Введение», каретка после «Вве» (колонка 5) → 3 символа текста.
    expect(caretTextOffset(['# Введение'], 0, 0, 5)).toBe(3)
  })

  it('inline-разметка до каретки не считается', () => {
    // «**жирный** текст», каретка сразу после «**жирный**» (колонка 10).
    expect(caretTextOffset(['**жирный** текст'], 0, 0, 10)).toBe('жирный'.length)
  })

  it('колонка внутри маркера не даёт отрицательного смещения', () => {
    expect(caretTextOffset(['- пункт'], 0, 0, 1)).toBe(0)
  })
})

describe('caretMap: смещение в листинге', () => {
  // ```python (0), x = 1 (1), print(x) (2), ``` (3)
  const LINES = ['```python', 'x = 1', 'print(x)', '```']

  it('на ограждении листинга — начало текста', () => {
    expect(codeTextOffset(LINES, 0, 0, 5)).toBe(0)
  })

  it('первая строка кода: смещение равно колонке', () => {
    expect(codeTextOffset(LINES, 0, 1, 3)).toBe(3)
  })

  it('следующая строка кода прибавляет длину предыдущей и перенос', () => {
    expect(codeTextOffset(LINES, 0, 2, 4)).toBe('x = 1'.length + 1 + 4)
  })

  it('код считается буквально — разметка НЕ снимается', () => {
    // В листинге «**» — это символы кода, а не жирный шрифт.
    expect(codeTextOffset(['```', '**x**', '```'], 0, 1, 5)).toBe(5)
  })

  it('колонка за концом строки обрезается по её длине', () => {
    expect(codeTextOffset(LINES, 0, 1, 99)).toBe('x = 1'.length)
  })
})

describe('caretMap: ячейка строки таблицы', () => {
  const ROW = '| Альфа | Бета |'

  it('каретка в первой ячейке', () => {
    // «| Альфа…»: колонка 4 — после «Ал»; ведущие пробелы ячейки отброшены.
    expect(cellAt(ROW, 4)).toEqual({ index: 0, before: 'Ал' })
  })

  it('каретка во второй колонке — во второй ячейке', () => {
    // Колонка 13 — после «Бет».
    expect(cellAt(ROW, 13)).toEqual({ index: 1, before: 'Бет' })
  })

  it('каретка на ведущем пробеле ячейки — её начало', () => {
    expect(cellAt(ROW, 2)).toEqual({ index: 0, before: '' })
  })

  it('каретка до первой «|» — начало первой ячейки', () => {
    expect(cellAt(ROW, 0)).toEqual({ index: 0, before: '' })
  })

  it('разметка внутри ячейки в вывод не идёт и в смещение не считается', () => {
    const cell = cellAt('| **жирный** |', 12)
    expect(cell.index).toBe(0)
    expect(scanText(cell.before).plain).toBe('жирный'.length)
  })
})

describe('caretMap: формулы в строке текста', () => {
  it('содержимое формулы в обычные символы не идёт — считается сама формула', () => {
    // «$…$» выводит KaTeX: посимвольного соответствия с исходником нет.
    expect(scanText('Оценка $\\hat{\\beta}$ дана')).toEqual({
      plain: 'Оценка '.length + ' дана'.length,
      formulas: 1,
      inFormula: false,
    })
  })

  it('обрыв на незакрытой «$» означает каретку внутри формулы', () => {
    const r = scanText('Оценка $\\hat{')
    expect(r.inFormula).toBe(true)
    // До формулы — только «Оценка », её содержимое не считается.
    expect(r.plain).toBe('Оценка '.length)
    expect(r.formulas).toBe(0)
  })

  it('вторая формула получает свой номер', () => {
    const r = scanText('$a$ и $b$ и ещё $c')
    expect(r.formulas).toBe(2)
    expect(r.inFormula).toBe(true)
  })

  it('позиция в блоке считает формулы предыдущих строк', () => {
    const lines = ['Формула $a$ здесь,', 'а тут $b$ ещё']
    expect(textPosAt(lines, 0, 1, 8)).toEqual({
      plain: 'Формула  здесь,'.length + 'а тут '.length,
      formulas: 1,
      inFormula: true,
      // LaTeX формулы до каретки — по нему ищется символ внутри неё.
      math: 'b',
    })
  })
})

describe('caretMap: подпись узла схемы', () => {
  const ROW = '  A[Начало] --> B[Процесс]'

  it('находит подпись в квадратных скобках и смещение в ней', () => {
    expect(mermaidLabelAt(ROW, 7)).toEqual({ text: 'Начало', offset: 3 })
    expect(mermaidLabelAt(ROW, 23)).toEqual({ text: 'Процесс', offset: 5 })
  })

  it('в синтаксисе схемы подписи нет', () => {
    // Колонка 13 — на стрелке «-->».
    expect(mermaidLabelAt(ROW, 13)).toBeNull()
    expect(mermaidLabelAt('flowchart LR', 4)).toBeNull()
  })

  it('понимает круглые и фигурные скобки, в том числе двойные', () => {
    expect(mermaidLabelAt('B((Конец))', 5)).toMatchObject({ text: 'Конец' })
    expect(mermaidLabelAt('C{Условие}', 4)).toMatchObject({ text: 'Условие' })
  })

  it('понимает подпись связи между вертикальными чертами и кавычки', () => {
    expect(mermaidLabelAt('A -->|да| B', 8)).toMatchObject({ text: 'да' })
    expect(mermaidLabelAt('A["Текст"] --> B', 5)).toMatchObject({ text: '"Текст"' })
  })

  it('пробелы по краям подписи в смещение не идут', () => {
    // «A[  Старт ]»: колонка 4 — первая буква подписи, два пробела до неё
    // в смещение не идут.
    expect(mermaidLabelAt('A[  Старт ]', 4)).toEqual({ text: 'Старт', offset: 0 })
    expect(mermaidLabelAt('A[  Старт ]', 5)).toEqual({ text: 'Старт', offset: 1 })
  })

  it('пустая подпись подписью не считается', () => {
    expect(mermaidLabelAt('A[]', 2)).toBeNull()
  })
})

describe('caretMap: счёт символов формулы', () => {
  // Формула из отчёта: β с «крышкой», транспонирования и степень −1.
  const BIG = '\\hat{\\boldsymbol{\\beta}} = (\\mathbf{X}^\\top \\mathbf{X})^{-1} \\mathbf{X}^\\top \\mathbf{y}'

  it('считает ровно столько символов, сколько KaTeX рисует', () => {
    // В выводе: β ^ = ( X ⊤ X ) − 1 X ⊤ y
    expect(mathGlyphs(BIG)).toBe(13)
  })

  it('обёртки шрифта и скобки группировки символов не дают', () => {
    expect(mathGlyphs('\\mathbf{X}')).toBe(1)
    expect(mathGlyphs('\\boldsymbol{\\beta}')).toBe(1)
    expect(mathGlyphs('{}_^ ')).toBe(0)
    expect(mathGlyphs('\\frac{a}{b}')).toBe(2)
  })

  it('команда-символ считается за один, диакритика — тоже', () => {
    expect(mathGlyphs('\\top')).toBe(1)
    expect(mathGlyphs('\\hat{x}')).toBe(2)
  })

  it('имя окружения в счёт не идёт', () => {
    expect(mathGlyphs('\\begin{cases} a \\end{cases}')).toBe(1)
  })

  it('оформительные команды пропускаются, а рисуемые скобки — нет', () => {
    expect(mathGlyphs('a \\, b \\quad c')).toBe(3)
    expect(mathGlyphs('\\{x\\}')).toBe(3)
  })

  it('исходник выключной формулы берётся без ограждений', () => {
    const lines = ['$$E = mc^2$$']
    // Колонка 7 — сразу за «m» (ограждение «$$» занимает две первые).
    expect(mathPrefix(lines, 0, 0, 7)).toBe('E = m')
    // Многострочная формула склеивается переносами.
    expect(mathPrefix(['$$', 'E = mc^2', '$$'], 0, 1, 3)).toBe('\nE =')
  })
})
