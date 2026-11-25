import { appVersion, config } from './config';
import { type Tokens, useSession } from './session';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** True when the request failed because the phone is offline or the server could not be reached. */
export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;

let refreshing: Promise<Tokens | null> | null = null;

async function refreshTokens(): Promise<Tokens | null> {
  const current = useSession.getState().tokens;
  if (!current) return null;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${config.apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ugo-App-Version': appVersion },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (res.status === 401) {
        await useSession.getState().clear();
        return null;
      }
      if (!res.ok) return null;
      const t = (await res.json()) as Tokens;
      await useSession.getState().setTokens(t);
      return t;
    } catch {
      return null;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const auth = opts.auth ?? true;
  const send = async (token?: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    try {
      return await fetch(`${config.apiUrl}/api/v1${path}`, {
        method: opts.method ?? (opts.body ? 'POST' : 'GET'),
        headers: {
          'Content-Type': 'application/json',
          'X-Ugo-App-Version': appVersion,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, 'You appear to be offline. Your work is saved and will sync later.');
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await send(auth ? useSession.getState().tokens?.accessToken : undefined);
  if (res.status === 401 && auth) {
    const t = await refreshTokens();
    if (!t) throw new ApiError(401, 'Please sign in again', 'SIGN_IN_REQUIRED');
    res = await send(t.accessToken);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(json.message) ? json.message.join('\n') : json.message ?? 'Something went wrong. Please try again.';
    throw new ApiError(res.status, msg, json.code);
  }
  return json as T;
}
