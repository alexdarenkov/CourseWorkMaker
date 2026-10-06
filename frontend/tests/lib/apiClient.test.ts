import { afterEach, expect, it, vi } from 'vitest'
import { apiBlob, ApiError } from '../../src/api/client'

afterEach(() => vi.unstubAllGlobals())
it('показывает причину 422 без содержимого полей запроса', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:[{msg:'Value error, Недопустимый символ в тексте',input:'не показывать'}]}), {status:422})))
  await expect(apiBlob('/api/convert/docx')).rejects.toThrow('Недопустимый символ в тексте')
})
it('DOCX сохраняет статус и сообщение ошибки', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Конвертер занят. Повторите запрос позже.'}), {status:429})))
  await expect(apiBlob('/api/convert/docx')).rejects.toMatchObject({status:429, message:'Конвертер занят. Повторите запрос позже.'})
})
it('не теряет статус при HTML-ошибке nginx', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>413</h1>', {status:413})))
  await expect(apiBlob('/api/convert/docx')).rejects.toBeInstanceOf(ApiError)
})
