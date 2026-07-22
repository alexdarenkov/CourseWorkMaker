import type { Settings, User } from '../lib/settings'
import { api, apiBlob } from './client'

export interface AuthResponse {
  token: string
  user: User
}

export const authApi = {
  register: (name: string, email: string, password: string) =>
    api<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    api<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => api<User>('/api/auth/me'),
  updateProfile: (name: string, email: string) =>
    api<AuthResponse>('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify({ name, email }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<void>('/api/auth/me/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
}

export const convertApi = {
  docx: (markdown: string, docName: string, settings: Settings, assets: Record<string, string>) =>
    apiBlob('/api/convert/docx', {
      method: 'POST',
      body: JSON.stringify({ markdown, docName, settings, assets }),
    }),
}

export type AiQuality = 'fast' | 'balanced' | 'quality'

export interface AiOptions {
  topic: string
  requirements: string
  target_pages: number
  quality: AiQuality
  include_bibliography: boolean
  include_tables: boolean
  include_diagrams: boolean
  include_formulas: boolean
  include_images: boolean
  include_web_images: boolean
  include_code_appendix: boolean
}

export interface AiJob {
  id: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  stage: string
  progress: number
  markdown: string | null
  /** Готовые на данный момент разделы (растёт по мере генерации). */
  partial?: string | null
  assets?: Record<string, string>
  error: string | null
}

export interface AiTierPricing {
  promptPerMillion: number
  completionPerMillion: number
  currency: string
  reasoning: boolean
}

export interface AiPricing {
  tiers: Record<AiQuality, AiTierPricing | null>
}

export const aiApi = {
  generate: (options: AiOptions, files: File[]) => {
    const form = new FormData()
    form.append('options', JSON.stringify(options))
    for (const f of files) form.append('files', f)
    return api<{ jobId: string }>('/api/ai/generate', { method: 'POST', body: form })
  },
  // Разбор промпта генерации: валидация + тема/требования + явные элементы
  // структуры (null — в промпте не упомянуто, тоггл не трогаем).
  analyzePrompt: (text: string) =>
    api<{
      ok: boolean
      reason: string | null
      topic: string
      requirements: string
      targetPages: number | null
      includeTables: boolean | null
      includeDiagrams: boolean | null
      includeFormulas: boolean | null
      includeImages: boolean | null
      includeWebImages: boolean | null
      includeCodeAppendix: boolean | null
      includeBibliography: boolean | null
    }>('/api/ai/analyze-prompt', { method: 'POST', body: JSON.stringify({ text }) }),
  // Правка всего документа по инструкции: результат применяется в редактор сразу.
  edit: (instruction: string, markdown: string) =>
    api<{ jobId: string }>('/api/ai/edit', {
      method: 'POST',
      body: JSON.stringify({ instruction, markdown }),
    }),
  job: (id: string) => api<AiJob>(`/api/ai/jobs/${id}`),
  cancel: (id: string) => api<{ status: string }>(`/api/ai/jobs/${id}/cancel`, { method: 'POST' }),
  pricing: () => api<AiPricing>('/api/ai/pricing'),
}
