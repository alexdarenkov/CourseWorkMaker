import { loadToken } from '../lib/storage'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function parseError(resp: Response): Promise<never> {
  let message = `Ошибка ${resp.status}`
  try {
    const body = await resp.json()
    if (body?.message) message = body.message
    else if (body?.detail) message = typeof body.detail === 'string' ? body.detail : message
  } catch {
    /* не JSON */
  }
  throw new ApiError(resp.status, message)
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  const token = loadToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const resp = await fetch(path, { ...init, headers })
  if (!resp.ok) await parseError(resp)
  if (resp.status === 204) return undefined as T
  return (await resp.json()) as T
}

export async function apiBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const token = loadToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const resp = await fetch(path, { ...init, headers })
  if (!resp.ok) await parseError(resp)
  return await resp.blob()
}
