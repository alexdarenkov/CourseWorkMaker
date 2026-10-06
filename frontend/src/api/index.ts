import type { Settings } from '../lib/settings'
import { apiBlob } from './client'

export const convertApi = {
  docx: (markdown: string, docName: string, settings: Settings, assets: Record<string, string>) =>
    apiBlob('/api/convert/docx', {
      method: 'POST',
      body: JSON.stringify({ markdown, docName, settings, assets }),
    }),
}
