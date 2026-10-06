import { afterEach, expect, it, vi } from 'vitest'
import * as assets from '../../src/lib/assets'
import { renderAll } from '../../src/lib/gostRender'
import { parseMD } from '../../src/lib/markdown'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'

afterEach(() => vi.restoreAllMocks())
it('300 CSS-пикселей дают 79.4 мм как обычный PNG в DOCX независимо от DPI', () => {
  vi.spyOn(assets, 'getImageSize').mockReturnValue({ w: 300, h: 300 })
  const { out } = renderAll(parseMD('![x](https://example.test/image.png)'), DEFAULT_SETTINGS, () => null)
  expect(out.map(b => b.html).join('')).toContain('width:79.4mm;height:79.4mm')
})
