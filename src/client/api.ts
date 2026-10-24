import type { AppState, Capture, Location, Session } from './types';

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
  session: () => request<Session>('/api/session'),
  login: (password: string) =>
    request<Session>('/api/login', {
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
  updateLocation: (locationId: string, fields: Partial<Omit<Location, 'id'>>) =>
    request<Location>(`/api/locations/${locationId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    }),
  moveCapture: (captureId: string, fields: Omit<Location, 'id'> & { scope: 'capture' | 'location' }) =>
    request<{ locationId: string }>(`/api/captures/${captureId}/placement`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    }),
  updateCapture: (captureId: string, fields: Partial<Pick<Capture, 'title' | 'description' | 'capturedAt' | 'initialYaw' | 'tags' | 'locationId'>>) =>
    request<Capture>(`/api/captures/${captureId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    }),
  deleteLocation: (locationId: string) =>
    request<void>(`/api/locations/${locationId}`, { method: 'DELETE' }),
  deleteCapture: (captureId: string) =>
    request<void>(`/api/captures/${captureId}`, { method: 'DELETE' }),
};

