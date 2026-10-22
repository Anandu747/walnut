export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('walnut_token') : null;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running on port 4000?');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth')) {
      localStorage.removeItem('walnut_token');
      localStorage.removeItem('walnut_user');
      window.location.href = '/login';
    }
    throw new ApiError(res.status, data?.error ?? 'Request failed', data?.details);
  }
  return data as T;
}
/** Authenticated binary fetch (documents, photos) returned as an object URL. */
export async function apiBlobUrl(path: string): Promise<string> {
  const token = localStorage.getItem('walnut_token');
  const res = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Could not load file');
  return URL.createObjectURL(await res.blob());
}
