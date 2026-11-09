const BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

let accessToken: string | null = localStorage.getItem('tk_access');
let refreshToken: string | null = localStorage.getItem('tk_refresh');

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('tk_access', access); else localStorage.removeItem('tk_access');
  if (refresh) localStorage.setItem('tk_refresh', refresh); else localStorage.removeItem('tk_refresh');
}
export function getRefreshToken() { return refreshToken; }
export function isLoggedIn() { return !!accessToken; }

/** Access tokens live 15 min — SSE/EventSource reconnects must not present
 * an expired JWT. Decode exp and refresh when under 60s remain. */
export async function ensureAccessToken(): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    if (typeof payload.exp === 'number' && payload.exp * 1000 - Date.now() > 60_000) return accessToken;
  } catch { /* malformed → try refresh anyway */ }
  return (await tryRefresh()) ? accessToken : null;
}

async function rawFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401 && retry && refreshToken && !path.startsWith('/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) return rawFetch(path, init, false);
  }
  return res;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) { setTokens(null, null); return false; }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await rawFetch(path, init);
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? res.statusText, e.details ?? e.issues);
  }
  return body as T;
}

export const get = <T = unknown>(path: string) => api<T>(path);
export const post = <T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers });
export const patch = <T = unknown>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });
