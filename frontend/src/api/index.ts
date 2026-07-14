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

export interface DocumentMeta {
  id: string
  name: string
  updatedAt: string
}

export interface DocumentDto {
  id: string
  name: string
  content: string
  settings: string
  updatedAt: string
}

export const documentsApi = {
  list: () => api<DocumentMeta[]>('/api/documents'),
  get: (id: string) => api<DocumentDto>(`/api/documents/${id}`),
  create: (name: string, content: string, settings: string) =>
    api<DocumentDto>('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ name, content, settings }),
    }),
  update: (id: string, name: string, content: string, settings: string) =>
    api<DocumentDto>(`/api/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, content, settings }),
    }),
  remove: (id: string) => api<void>(`/api/documents/${id}`, { method: 'DELETE' }),
}

export const convertApi = {
  docx: (markdown: string, docName: string, settings: Settings, assets: Record<string, string>) =>
    apiBlob('/api/convert/docx', {
      method: 'POST',
      body: JSON.stringify({ markdown, docName, settings, assets }),
    }),
  // Тот же DOCX, дорендеренный сервером в PDF (LibreOffice, с заполненным содержанием).
  pdf: (markdown: string, docName: string, settings: Settings, assets: Record<string, string>) =>
    apiBlob('/api/convert/pdf', {
      method: 'POST',
      body: JSON.stringify({ markdown, docName, settings, assets }),
    }),
  // Первая страница пользовательского титульника (PDF/DOCX) → PNG data-URL.
  titleImage: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api<{ image: string }>('/api/convert/title-image', { method: 'POST', body: form })
  },
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
  // Смысловая проверка промпта быстрой моделью до запуска конвейера.
  validatePrompt: (kind: 'topic' | 'edit', text: string) =>
    api<{ ok: boolean; reason: string | null }>('/api/ai/validate-prompt', {
      method: 'POST',
      body: JSON.stringify({ kind, text }),
    }),
  edit: (instruction: string, markdown: string) =>
    api<{ jobId: string }>('/api/ai/edit', {
      method: 'POST',
      body: JSON.stringify({ instruction, markdown }),
    }),
  // Правка одного раздела: дешевле и не трогает остальной текст.
  editSection: (instruction: string, sectionTitle: string, markdown: string) =>
    api<{ jobId: string }>('/api/ai/edit-section', {
      method: 'POST',
      body: JSON.stringify({ instruction, section_title: sectionTitle, markdown }),
    }),
  job: (id: string) => api<AiJob>(`/api/ai/jobs/${id}`),
  cancel: (id: string) => api<{ status: string }>(`/api/ai/jobs/${id}/cancel`, { method: 'POST' }),
  pricing: () => api<AiPricing>('/api/ai/pricing'),
  // Нормоконтроль: проверка оформления без LLM (работает без AI_API_KEY);
  // check_urls дополнительно проверяет доступность ссылок из списка источников.
  lint: (markdown: string) =>
    api<{ issues: string[] }>('/api/ai/lint', {
      method: 'POST',
      body: JSON.stringify({ markdown, check_urls: true }),
    }),
}
