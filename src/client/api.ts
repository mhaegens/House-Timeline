import type { AppState, Capture, Location } from './types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? 'Request failed.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  session: () => request<{ authenticated: boolean }>('/api/session'),
  login: (password: string) =>
    request<{ authenticated: boolean }>('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
  logout: () => request('/api/logout', { method: 'POST' }),
  state: () => request<AppState>('/api/state'),
  createLocation: (location: Omit<Location, 'id'>) =>
    request<Location>('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(location),
    }),
  addCapture: (locationId: string, formData: FormData) =>
    request<Capture>(`/api/locations/${locationId}/captures`, { method: 'POST', body: formData }),
  deleteLocation: (locationId: string) =>
    request<void>(`/api/locations/${locationId}`, { method: 'DELETE' }),
  deleteCapture: (captureId: string) =>
    request<void>(`/api/captures/${captureId}`, { method: 'DELETE' }),
};
