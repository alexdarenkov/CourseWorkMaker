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
    else if (typeof body?.detail === 'string') message = body.detail
    else if (Array.isArray(body?.detail)) {
      const details = body.detail.map((item: { msg?: unknown }) => typeof item.msg === 'string' ? item.msg.replace(/^Value error, /, '') : '').filter(Boolean)
      if (details.length) message = details.join('; ')
    }
  } catch {
    /* не JSON */
  }
  throw new ApiError(resp.status, message)
}

export async function apiBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const resp = await fetch(path, { ...init, headers })
  if (!resp.ok) await parseError(resp)
  return await resp.blob()
}
