/**
 * Импорт .md/.zip: починка кириллицы в именах архива, отсев мусора macOS,
 * поиск и перепривязка локальных ссылок на картинки.
 */
import { describe, expect, it } from 'vitest'
import {
  baseName,
  findLocalRefs,
  fixZipName,
  isMacJunk,
  isResolvable,
  mimeOf,
  normPath,
  pickMainMdEntry,
  relinkLocalRefs,
} from '../../src/lib/docImport'

/** UTF-8 байты строки, прочитанные как latin1 (так fflate отдаёт имена без флага UTF-8). */
const mangle = (s: string) =>
  [...new TextEncoder().encode(s)].map((b) => String.fromCharCode(b)).join('')

describe('fixZipName', () => {
  it('чинит кириллицу, прочитанную как latin1', () => {
    expect(fixZipName(mangle('схема.png'))).toBe('схема.png')
    expect(fixZipName(mangle('папка/отчёт.md'))).toBe('папка/отчёт.md')
  })

  it('ASCII и настоящий UTF-8 (символы >255) не трогает', () => {
    expect(fixZipName('report.md')).toBe('report.md')
    expect(fixZipName('схема.png')).toBe('схема.png')
  })

  it('невалидный UTF-8 оставляет как есть', () => {
    expect(fixZipName('ÿþ')).toBe('ÿþ')
  })
})

describe('isMacJunk', () => {
  it('отсекает __MACOSX и AppleDouble-файлы', () => {
    expect(isMacJunk('__MACOSX/отчёт.md')).toBe(true)
    expect(isMacJunk('images/._схема.png')).toBe(true)
    expect(isMacJunk('images/схема.png')).toBe(false)
  })
})

describe('findLocalRefs / isResolvable', () => {
  it('http/data/asset/placeholder — резолвятся сами, локальные пути — нет', () => {
    expect(isResolvable('https://x/a.png')).toBe(true)
    expect(isResolvable('data:image/png;base64,x')).toBe(true)
    expect(isResolvable('asset:img-1')).toBe(true)
    expect(isResolvable('placeholder')).toBe(true)
    expect(isResolvable('images/схема.png')).toBe(false)
  })

  it('собирает только локальные ссылки, без дублей', () => {
    const md = [
      '![а](images/one.png)',
      '![б](https://x/two.png)',
      '![в](asset:img-3)',
      '![г](images/one.png)',
      '![д](./sub/four.jpg)',
    ].join('\n')
    expect(findLocalRefs(md)).toEqual(['images/one.png', './sub/four.jpg'])
  })
})

describe('relinkLocalRefs', () => {
  it('переписывает известные локальные ссылки, считает подстановки', () => {
    const md = '![а](images/one.png)\n![б](https://x/two.png)\n![в](images/lost.png)'
    const { out, linked } = relinkLocalRefs(md, new Map([['images/one.png', 'asset:img-9']]))
    expect(out).toContain('![а](asset:img-9)')
    expect(out).toContain('![б](https://x/two.png)')
    expect(out).toContain('![в](images/lost.png)')
    expect(linked).toBe(1)
  })
})

describe('pickMainMdEntry', () => {
  it('берёт корневой .md (минимальная глубина), затем кратчайшее имя', () => {
    const files = [
      { name: 'docs/deep/readme.md' },
      { name: 'отчёт-полный.md' },
      { name: 'а.md' },
      { name: 'images/x.png' },
    ]
    expect(pickMainMdEntry(files)?.name).toBe('а.md')
  })

  it('undefined, если .md нет', () => {
    expect(pickMainMdEntry([{ name: 'images/x.png' }])).toBeUndefined()
  })
})

describe('нормализация путей', () => {
  it('normPath: без ./, без регистра, NFC', () => {
    expect(normPath('./Images/Схема.PNG')).toBe('images/схема.png')
    // NFD (как в именах macOS) приводится к NFC.
    expect(normPath('схёма.png')).toBe('схёма.png')
  })

  it('baseName: имя без каталогов', () => {
    expect(baseName('a/b/Схема.PNG')).toBe('схема.png')
    expect(baseName('плоское.jpg')).toBe('плоское.jpg')
  })

  it('mimeOf: по расширению, фолбэк jpeg', () => {
    expect(mimeOf('x.png')).toBe('image/png')
    expect(mimeOf('x.webp')).toBe('image/webp')
    expect(mimeOf('x.gif')).toBe('image/gif')
    expect(mimeOf('x.jpg')).toBe('image/jpeg')
    expect(mimeOf('x.jpeg')).toBe('image/jpeg')
  })
})
