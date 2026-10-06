import { describe, expect, it } from 'vitest'
import { renderAll } from '../../src/lib/gostRender'
import { inline, parseMD } from '../../src/lib/markdown'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'

const render = (md: string, autoNumber = true) => renderAll(parseMD(md), { ...DEFAULT_SETTINGS, autoNumber }, () => null).out

describe('согласованные правила оформления', () => {
  it.each([3, 4, 6, 7])('таблица из %i столбцов: порог 4, полужирная только шапка', (n) => {
    const row = '| ' + Array(n).fill('Текст').join(' | ') + ' |'
    const table = render(row + '\n|' + '---|'.repeat(n) + '\n' + row).find(b => b.table)!
    expect(table.table!.openTag).toContain(`font-size:${n < 4 ? 14 : 12}pt`)
    expect(table.table!.headHtml).toContain('font-weight:bold')
    expect(table.table!.rows.join('')).not.toContain('font-weight:bold')
  })

  it('встроенный код 12 pt; текст и пробелы сохранены', () => {
    expect(inline('` a  b `')).toContain('font-size:12pt')
    expect(inline('` a  b `')).toContain('> a  b </span>')
  })

  it('без автонумерации подпись таблицы сохраняется без номера', () => {
    const table = render('Таблица: Опыт\n| А |\n|---|\n| Б |', false).find(b => b.table)!
    expect(table.table!.caption).toContain('Опыт')
    expect(table.table!.caption).not.toContain('Таблица 1')
  })

  it('пустая подпись рисунка не оставляет разделитель', () => {
    const fig = render('![](missing)').find(b => b.html.includes('Рисунок 1'))!
    expect(fig.html).not.toContain('Рисунок 1 -')
  })

  it('буквенные пункты после текста сохраняют маркеры и строки исходника', () => {
    const blocks = parseMD('Текст\nа) Первый;\nб) Второй.\n\n1) Новый.')
    expect(blocks[1]).toMatchObject({ type: 'ul', markers: ['а)', 'б)'], itemLines: [1, 2] })
    const html = renderAll(blocks, DEFAULT_SETTINGS, () => null).out.map(b => b.html).join('')
    expect(html).toContain('а)&nbsp;Первый;')
    expect(html).toContain('б)&nbsp;Второй.')
    expect(html).toContain('1)&nbsp;Новый.')
  })

  it('после завершающего объекта остаётся свободная строка', () => {
    for (const md of ['$$x=1$$', '![](missing)', '```\nx\n```', '| А |\n|---|\n| Б |']) {
      const blocks = render(md)
      expect(blocks[blocks.length - 1]?.isBlank).toBe(true)
    }
  })
})
