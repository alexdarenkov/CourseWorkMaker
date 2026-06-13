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
  edit: (instruction: string, markdown: string) =>
    api<{ jobId: string }>('/api/ai/edit', {
      method: 'POST',
      body: JSON.stringify({ instruction, markdown }),
    }),
  job: (id: string) => api<AiJob>(`/api/ai/jobs/${id}`),
  cancel: (id: string) => api<{ status: string }>(`/api/ai/jobs/${id}/cancel`, { method: 'POST' }),
  pricing: () => api<AiPricing>('/api/ai/pricing'),
}
