const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

export function authFetch(path: string, idToken: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
    },
  });
}
