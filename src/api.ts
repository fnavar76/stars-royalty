/** Same-origin API in production; Vite proxies /api during local development. */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

const mutations = new Map<string, Promise<unknown>>()
const mutationKeys = new Map<string, string>()
export function request<T = unknown>(path:string,options:RequestInit={}):Promise<T> {
  if(!options.method || ['GET','HEAD'].includes(options.method.toUpperCase()))return performRequest<T>(path,options)
  let user='';try{user=String(JSON.parse(localStorage.getItem('stars-session')??'null')?.user?.id??'')}catch{ /* The request handles an invalid session. */ }
  const operation=`${user}:${options.method}:${path}:${String(options.body??'')}`
  const current=mutations.get(operation);if(current)return current as Promise<T>
  const key=mutationKeys.get(operation)??crypto.randomUUID();mutationKeys.set(operation,key)
  const headers=new Headers(options.headers);headers.set('Idempotency-Key',key)
  const pending=performRequest<T>(path,{...options,headers},operation).finally(()=>mutations.delete(operation))
  mutations.set(operation,pending);return pending
}

async function performRequest<T = unknown>(path: string, options: RequestInit = {}, operation?:string): Promise<T> {
  let token: string | undefined
  try { token = JSON.parse(localStorage.getItem('stars-session') ?? 'null')?.token } catch { localStorage.removeItem('stars-session') }
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let response: Response
  try { response = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: options.signal ?? AbortSignal.timeout(20000) }) }
  catch { throw new Error('No se pudo conectar con el servidor. Comprueba tu conexión e intenta de nuevo.') }
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if(operation && response.status<500)mutationKeys.delete(operation)
  if (response.status === 401) {
    localStorage.removeItem('stars-session')
    window.dispatchEvent(new Event('stars-session-expired'))
  }
  if (!response.ok) throw new Error(data.error ?? 'No fue posible completar la operación.')
  if (options.method && options.method !== 'GET') window.dispatchEvent(new Event('stars-data-changed'))
  return data
}

export function hasPermission(scope: string): boolean {
  try { return Boolean(JSON.parse(localStorage.getItem('stars-session') ?? 'null')?.user?.permissions?.includes(scope)) }
  catch { return false }
}
