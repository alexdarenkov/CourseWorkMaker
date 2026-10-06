/**
 * Подсветка markdown-редактора. Главное — overlay-инвариант
 * (docs/architecture/overview.md, «Frontend: ключевые модули»): слой <pre>
 * обязан сохранять метрики глифов textarea, поэтому inline-стили токенов
 * могут менять ТОЛЬКО color/background/border-radius (рамка ```-блока ещё и
 * display:block — без отступов), а текст после снятия
 * тегов обязан побайтно совпадать с исходником (включая маркеры ** и `).
 */
import { describe, expect, it } from 'vitest'
import { edColors, highlight } from '../../src/lib/highlight'

const DOC = [
  '# Заголовок с **жирным**',
  'Текст с *курсивом*, `коде < 1`, $x^2$ и [ссылкой](https://x).',
  '![схема](asset:img-1)',
  'Рисунок: Схема системы',
  '- пункт списка',
  '1. нумерованный',
  '> цитата',
  '$$E=mc^2$$',
  '$$',
  'F = ma',
  '$$',
  '---',
  'Таблица: Результаты',
  '| Метод | **Ошибка** |',
  '| :--- | ---: |',
  '| A | 0,1 |',
  '```mermaid',
  'flowchart LR',
  '  %% комментарий "в кавычках"',
  '  A[Данные] --> B{Фильтр}',
  '  B -->|оценка| C("end")',
  '```',
  '```python',
  'def f(x):  # комментарий "с кавычками"',
  '    return "строка" + str(3.14)',
  '```',
  '```sql',
  "select id from users where name = 'а' -- хвост",
  '```',
  '```неизвестный',
  'просто текст 42',
  '```',
  'обычный хвост с 2 < 3 и "кавычками"',
].join('\n')

/** Снимает теги и HTML-экранирование — остаётся то, что видит пользователь. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

describe('overlay-инвариант подсветки', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`тема ${theme}: inline-стили содержат только color/background/border-radius (+display:block у рамки)`, () => {
      const out = highlight(DOC, edColors(theme))
      const styles = [...out.matchAll(/style="([^"]*)"/g)].map((m) => m[1])
      expect(styles.length).toBeGreaterThan(0)
      for (const style of styles) {
        for (const decl of style.split(';').filter(Boolean)) {
          const [prop, value] = decl.split(':').map((x) => x.trim())
          if (prop === 'display') expect(value).toBe('block')
          else expect(['color', 'background', 'border-radius']).toContain(prop)
        }
      }
    })

    it(`тема ${theme}: текст после снятия тегов совпадает с исходником`, () => {
      const out = highlight(DOC, edColors(theme))
      expect(plainText(out)).toBe(DOC)
      expect(out.split('\n')).toHaveLength(DOC.split('\n').length)
    })
  }
})

describe('токены кода', () => {
  const C = edColors('light')

  it('fence-переключение: внутри ```python ключевые слова подсвечены, снаружи — нет', () => {
    const lines = highlight('```python\nreturn x\n```\nreturn x', C).split('\n')
    expect(lines[1]).toContain('color:' + C.codeKw)
    expect(lines[3]).not.toContain('color:' + C.codeKw)
  })

  it('комментарий «съедает» строку внутри себя', () => {
    const out = highlight('```python\nx = 1  # тут "не строка"\n```', C).split('\n')[1]
    expect(out).toContain('color:' + C.codeCom)
    // Кавычки внутри комментария не образуют отдельного строкового токена.
    expect(out).not.toContain('<span style="color:' + C.codeStr + '">&quot;не строка&quot;</span>')
  })

  it('sql: регистронезависимые ключевые слова и строки в одинарных кавычках', () => {
    const out = highlight("```sql\nSELECT 'имя' FROM t\n```", C).split('\n')[1]
    expect(out).toContain('color:' + C.codeKw)
    expect(out).toContain('color:' + C.codeStr)
  })

  it('неизвестный язык: подсвечиваются только строки и числа', () => {
    const out = highlight('```текст\nselect 42 "строка"\n```', C).split('\n')[1]
    expect(out).not.toContain('color:' + C.codeKw)
    expect(out).toContain('color:' + C.codeNum)
    expect(out).toContain('color:' + C.codeStr)
  })
})

describe('inline-выделения', () => {
  const C = edColors('light')

  it('жирный, курсив, код, картинка и ссылка — разные цвета', () => {
    const out = highlight('**Ж** *К* `код` ![alt](x) [ссылка](y)', C)
    expect(out).toContain('<span style="color:' + C.bold + '">Ж</span>')
    expect(out).toContain('<span style="color:' + C.italic + '">К</span>')
    expect(out).toContain('color:' + C.code + ';background:' + C.chipBg)
    expect(out).toContain('<span style="color:' + C.image + '">![alt]</span>')
    expect(out).toContain('<span style="color:' + C.link + '">[ссылка]</span>')
    expect(new Set([C.bold, C.italic, C.code, C.image, C.link]).size).toBe(5)
  })
})

describe('блоки', () => {
  const C = edColors('light')

  it('mermaid: ключевые слова, стрелки, подписи; язык в fence', () => {
    const lines = highlight('```mermaid\nflowchart LR\n  A[end] --> B\n```', C).split('\n')
    expect(lines[0]).toContain('<span style="color:' + C.mmKw + '">mermaid</span>')
    expect(lines[1]).toContain('<span style="color:' + C.mmKw + '">flowchart</span>')
    expect(lines[2]).toContain('<span style="color:' + C.mmArrow + '">--&gt;</span>')
    // Ключевое слово внутри подписи узла не подсвечивается отдельно.
    expect(lines[2]).toContain('<span style="color:' + C.mmLabel + '">[end]</span>')
  })

  it('после закрытия mermaid-блока обычный код снова подсвечивается как код', () => {
    const lines = highlight('```mermaid\ngraph TD\n```\n```python\nreturn 1\n```', C).split('\n')
    expect(lines[4]).toContain('color:' + C.codeKw)
    expect(lines[4]).not.toContain('color:' + C.mmKw)
  })

  it('таблица: вертикальные черты цветом таблицы, разделитель приглушён, в ячейках inline', () => {
    const lines = highlight('| **a** | b |\n| --- | --- |', C).split('\n')
    expect(lines[0]).toContain('<span style="color:' + C.table + '">|</span>')
    expect(lines[0]).toContain('<span style="color:' + C.bold + '">a</span>')
    expect(lines[1]).toContain('<span style="color:' + C.dim + '"> --- </span>')
  })

  it('многострочная $$-формула подсвечена целиком и стоит в рамке, после неё — обычный текст', () => {
    const box = '<span style="display:block;background:' + C.codeBg + ';border-radius:6px">'
    const math = (t: string) => '<span style="color:' + C.math + '">' + t + '</span>'
    const out = highlight('$$\n**x**\n$$\n**y**', C)
    expect(out.startsWith(box + math('$$') + '\n' + math('**x**') + '\n' + math('$$') + '\n</span>')).toBe(true)
    expect(out.split('\n')[3]).toContain('color:' + C.bold)
    expect(out.match(/display:block/g)).toHaveLength(1)
  })

  it('однострочная $$…$$ в рамке и не открывает блок', () => {
    const out = highlight('$$E$$\n**y**', C)
    expect(out.match(/display:block/g)).toHaveLength(1)
    expect(out).toContain('$$E$$</span>\n</span>')
    expect(out.split('\n')[1]).toContain('color:' + C.bold)
  })

  it('inline-формула на плашке, как inline-код', () => {
    expect(highlight('и $x$', C)).toContain('color:' + C.math + ';background:' + C.chipBg + ';border-radius:3px">$x$')
  })

  it('$$ внутри блока кода не открывает рамку формулы', () => {
    const out = highlight('```\n$$\n```\nтекст', C)
    expect(out.match(/display:block/g)).toHaveLength(1)
    expect(out.endsWith('текст')).toBe(true)
  })

  it('```-блок в рамке: перевод строки после блока — внутри рамки', () => {
    const box = '<span style="display:block;background:' + C.codeBg + ';border-radius:6px">'
    const out = highlight('до\n```python\nx\n```\nпосле', C)
    expect(out.startsWith('до\n' + box)).toBe(true)
    expect(out).toContain('```</span>\n</span>после')
    expect(out.match(/display:block/g)).toHaveLength(1)
  })

  it('незакрытый блок — рамка до конца документа', () => {
    const out = highlight('```mermaid\ngraph TD', C)
    expect(out.endsWith('</span></span>')).toBe(true)
    expect(out.match(/display:block/g)).toHaveLength(1)
  })

  it('вызов функции подсвечен, ключевое слово перед скобкой остаётся ключевым', () => {
    const line = highlight('```python\nif (x): print(x)\n```', C).split('\n')[1]
    expect(line).toContain('<span style="color:' + C.codeKw + '">if</span>')
    expect(line).toContain('<span style="color:' + C.codeFn + '">print</span>')
  })

  it('однострочная $$…$$ не открывает блок', () => {
    const lines = highlight('$$E$$\n**y**', C).split('\n')
    expect(lines[1]).toContain('color:' + C.bold)
  })

  it('разрыв страницы --- на плашке', () => {
    expect(highlight('---', C)).toBe(
      '<span style="color:' + C.fence + ';background:' + C.chipBg + ';border-radius:3px">---</span>',
    )
  })
})

describe('палитры тем', () => {
  it('светлая и тёмная темы дают разные цвета, все ключи заполнены', () => {
    const light = edColors('light')
    const dark = edColors('dark')
    expect(light.bg).not.toBe(dark.bg)
    for (const v of [...Object.values(light), ...Object.values(dark)]) {
      expect(v).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('auto использует светлую палитру (тему решает applyTheme, не подсветка)', () => {
    expect(edColors('auto')).toEqual(edColors('light'))
  })
})
