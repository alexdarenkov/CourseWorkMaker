import { afterEach, expect, it, vi } from 'vitest'
import { addImageAsset, getAsset } from '../../src/lib/assets'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each(['image/webp', 'image/svg+xml', 'image/gif'])('нормализует небольшой %s в PNG для DOCX', async type => {
  vi.stubGlobal('Image', class {
    naturalWidth = 10
    naturalHeight = 10
    onload: (() => void) | null = null
    set src(_value: string) { queueMicrotask(() => this.onload?.()) }
  })
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,YQ==')
  const key = await addImageAsset(new File(['image'], 'image', { type }))
  expect(encode).toHaveBeenCalledWith('image/png')
  expect(drawImage).toHaveBeenCalledOnce()
  expect(getAsset(key)).toBe('data:image/png;base64,YQ==')
})
