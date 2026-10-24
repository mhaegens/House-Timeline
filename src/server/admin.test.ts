import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

let runtime: typeof import('./index.js');
let base: string;
let viewer: string;
let admin: string;
let tempDir: string;
const secret = 'test-session-secret-with-enough-characters';

async function request(route: string, method = 'GET', cookie?: string, body?: unknown) {
  return fetch(`${base}${route}`, { method, headers: {
    ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
}
async function login(password: string) {
  const response = await request('/api/login', 'POST', undefined, { password });
  return { response, cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
async function point() {
  const response = await request('/api/locations', 'POST', admin, { floorId: 'ground', x: 0.2, y: 0.3, label: 'Kitchen' });
  expect(response.status).toBe(201); return response.json();
}
async function capture(locationId: string) {
  const form = new FormData();
  form.set('title', 'Construction'); form.set('capturedAt', '2026-09-15T15:00:00+02:00');
  const response = await fetch(`${base}/api/locations/${locationId}/captures`, { method: 'POST', headers: { Cookie: admin }, body: form });
  expect(response.status).toBe(201); return response.json();
}

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'house-memory-test-'));
  Object.assign(process.env, { USE_IN_MEMORY_DB: 'true', PORT: '0', DATA_DIR: tempDir,
    APP_PASSWORD: 'viewer-test', ADMIN_PASSWORD: 'admin-test', SESSION_SECRET: secret });
  runtime = await import('./index.js');
  if (!runtime.server.listening) await new Promise<void>((resolve) => runtime.server.once('listening', resolve));
  base = `http://127.0.0.1:${(runtime.server.address() as AddressInfo).port}`;
  viewer = (await login('viewer-test')).cookie; admin = (await login('admin-test')).cookie;
});
afterAll(async () => {
  if (runtime) { await new Promise<void>((resolve, reject) => runtime.server.close((error) => error ? reject(error) : resolve())); await (await import('./db.js')).pool.end(); }
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

describe('server-enforced viewer and admin permissions', () => {
  it('identifies both roles and protects anonymous reads', async () => {
    expect((await request('/api/state')).status).toBe(401);
    expect(await (await request('/api/session', 'GET', viewer)).json()).toEqual({ authenticated: true, role: 'viewer' });
    expect(await (await request('/api/session', 'GET', admin)).json()).toEqual({ authenticated: true, role: 'admin' });
    expect((await request('/api/state', 'GET', viewer)).status).toBe(200);
    expect((await request('/api/login', 'POST', undefined, { password: 'wrong' })).status).toBe(401);
  });
  it('treats old signed sessions as read-only and rejects tampering', async () => {
    const expiry = String(Date.now() + 60000);
    const signature = createHmac('sha256', secret).update(expiry).digest('base64url');
    const legacy = `house_memory_session=${expiry}.${signature}`;
    expect((await (await request('/api/session', 'GET', legacy)).json()).role).toBe('viewer');
    expect((await request('/api/locations', 'POST', legacy, { floorId: 'ground', x: 0, y: 0, label: 'Blocked' })).status).toBe(403);
    const tampered = viewer.replace('viewer', 'admin');
    expect((await request('/api/state', 'GET', tampered)).status).toBe(401);
    expect((await request('/api/state', 'GET', `${legacy}.extra`)).status).toBe(401);
  });
  it('blocks every viewer mutation before saving uploaded files', async () => {
    const location = await point(); const item = await capture(location.id);
    const mutations: [string, string][] = [
      ['/api/locations', 'POST'], [`/api/locations/${location.id}`, 'PATCH'], [`/api/locations/${location.id}`, 'DELETE'],
      [`/api/captures/${item.id}`, 'PATCH'], [`/api/captures/${item.id}/placement`, 'PATCH'], [`/api/captures/${item.id}`, 'DELETE'],
    ];
    for (const [route, method] of mutations) expect((await request(route, method, viewer, {})).status).toBe(403);
    const form = new FormData(); form.set('panorama', new Blob(['test'], { type: 'image/jpeg' }), 'test.jpg');
    expect((await fetch(`${base}/api/locations/${location.id}/captures`, { method: 'POST', headers: { Cookie: viewer }, body: form })).status).toBe(403);
    expect(await fs.readdir(path.join(tempDir, 'uploads'))).toHaveLength(0);
  });
  it('moves a point between floors with its complete history', async () => {
    const location = await point(); const item = await capture(location.id); const other = await capture(location.id);
    expect((await request(`/api/captures/${item.id}/placement`, 'PATCH', admin,
      { floorId: 'basement', x: 0, y: 1, label: 'Basement corner', scope: 'location' })).status).toBe(200);
    const state = await (await request('/api/state', 'GET', admin)).json();
    expect(state.locations.find((value: { id: string }) => value.id === location.id)).toMatchObject({ floorId: 'basement', x: 0, y: 1, label: 'Basement corner' });
    expect(state.captures.filter((value: { id: string; locationId: string }) => [item.id, other.id].includes(value.id)).every((value: { locationId: string }) => value.locationId === location.id)).toBe(true);
  });
  it('splits one misplaced capture without moving other dates', async () => {
    const location = await point(); const item = await capture(location.id); const other = await capture(location.id);
    const response = await request(`/api/captures/${item.id}/placement`, 'PATCH', admin,
      { floorId: 'first', x: 0.6, y: 0.4, label: 'Bedroom', scope: 'capture' });
    expect(response.status).toBe(200); const { locationId } = await response.json(); expect(locationId).not.toBe(location.id);
    const state = await (await request('/api/state', 'GET', admin)).json();
    expect(state.captures.find((value: { id: string }) => value.id === item.id).locationId).toBe(locationId);
    expect(state.captures.find((value: { id: string }) => value.id === other.id).locationId).toBe(location.id);
    expect(state.locations.find((value: { id: string }) => value.id === location.id).floorId).toBe('ground');
  });
  it('edits notes and capture time, and validates placement bounds', async () => {
    const location = await point(); const item = await capture(location.id);
    const update = await request(`/api/captures/${item.id}`, 'PATCH', admin, { description: 'Pipes under the slab', title: 'Plumbing', tags: ['pipes'], initialYaw: 45, capturedAt: '2026-09-15T15:01:00+02:00' });
    expect(update.status).toBe(200); expect(await update.json()).toMatchObject({ description: 'Pipes under the slab', tags: ['pipes'], title: 'Plumbing', initialYaw: 45 });
    for (const fields of [{ x: -0.1 }, { y: 1.1 }, { floorId: 'roof' }, { label: '' }, {}]) {
      expect((await request(`/api/locations/${location.id}`, 'PATCH', admin, fields)).status).toBe(400);
    }
    expect((await request(`/api/locations/${location.id}`, 'PATCH', admin, { floorId: 'first', x: 0.8, y: 0.2 })).status).toBe(200);
  });
});
