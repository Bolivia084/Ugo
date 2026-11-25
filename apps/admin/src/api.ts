/** Admin API client. Tokens are kept in memory only; closing the tab signs you out. */
const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/v1';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onSignedOut: () => void = () => undefined;

export function setTokens(a: string | null, r: string | null) {
  accessToken = a;
  refreshToken = r;
}
export function onSignOut(fn: () => void) {
  onSignedOut = fn;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const send = () =>
    fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(opts.auth !== false && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  let res = await send();
  if (res.status === 401 && refreshToken && opts.auth !== false) {
    const r = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
    if (r.ok) {
      const t = await r.json();
      setTokens(t.accessToken, t.refreshToken);
      res = await send();
    } else {
      setTokens(null, null);
      onSignedOut();
    }
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(json.message) ? json.message.join('\n') : json.message ?? `Error ${res.status}`);
  return json as T;
}

export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;
export const EXAMS = ['FSLC', 'COMMON_ENTRANCE', 'BECE', 'WAEC', 'NECO', 'JAMB', 'SAT', 'IELTS'] as const;
export type Exam = (typeof EXAMS)[number];
