/** JSON error without navigation or automatic write retries. 403 may mean permission or CSRF failure. */
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly data: unknown = null) {
    super(message); this.name = 'ApiError';
  }
  get authRequired() { return this.status === 401; }
  get forbidden() { return this.status === 403; }
}
export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON-serializable payload; FormData and streaming bodies are not supported. */
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  /** Cookie-bound token from the endpoint's GET response. Falls back to csrf-token meta. */
  csrfToken?: string;
};
/** Accept only root-relative paths, never origins, credentials, fragments or normalized traversal. */
export function safeApiPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\s#]/.test(path)) throw new TypeError('Expected a root-relative API path');
  const pathname = path.split('?')[0];
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { throw new TypeError('Invalid API path encoding'); }
  if (/[\\\u0000-\u001f\u007f?#%]/.test(decoded) || decoded.startsWith('//') || decoded.split('/').some(part => part === '.' || part === '..')) throw new TypeError('Unsafe API path');
  return path;
}
/**
 * Same-origin JSON fetch. Browser supplies Origin; credentials and redirect policy cannot be overridden.
 * Writes require the existing X-CSRF-Token contract, not a synthetic Origin or a new token endpoint.
 * No retries, login navigation or token caching. T describes the endpoint contract, not runtime validation.
 */
export async function requestJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const target = safeApiPath(path);
  const method = options.method ?? 'GET';
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (method !== 'GET') {
    const token = options.csrfToken ?? headers.get('X-CSRF-Token') ?? document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
    if (!token?.trim()) throw new ApiError('CSRF token required. Reload the endpoint data before writing.', 403);
    headers.set('X-CSRF-Token', token);
  }
  if (options.body !== undefined) {
    if (method === 'GET') throw new TypeError('GET requests cannot have a body');
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(target, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal, credentials: 'same-origin', mode: 'same-origin', redirect: 'error' });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch {
    if (response.ok) throw new ApiError('Expected a JSON response', response.status);
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' ? data.message : data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }
  return data as T;
}
