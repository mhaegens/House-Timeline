import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from './config.js';

export const SESSION_COOKIE = 'house_memory_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function sign(value: string) {
  return createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

export type SessionRole = 'viewer' | 'admin';

export function createSessionToken(role: SessionRole = 'viewer') {
  const expiresAt = String(Date.now() + SESSION_DURATION_MS);
  const payload = `v2.${role}.${expiresAt}`;
  return `${payload}.${sign(`${payload}:${role === 'admin' ? config.adminPassword : config.appPassword}`)}`;
}

function signaturesMatch(expectedValue: string, receivedValue: string) {
  const expected = Buffer.from(expectedValue);
  const received = Buffer.from(receivedValue);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function sessionRole(token: unknown): SessionRole | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  // Previously issued shared-password sessions become read-only after this upgrade.
  if (parts.length === 2) {
    const [expiresAt, signature] = parts;
    if (!/^\d+$/.test(expiresAt) || Number(expiresAt) <= Date.now()) return null;
    return signaturesMatch(sign(expiresAt), signature) ? 'viewer' : null;
  }
  const [version, role, expiresAt, signature] = parts;
  if (parts.length !== 4 || version !== 'v2' || (role !== 'viewer' && role !== 'admin')) return null;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) <= Date.now()) return null;
  const password = role === 'admin' ? config.adminPassword : config.appPassword;
  if (!password) return null;
  return signaturesMatch(sign(`${version}.${role}.${expiresAt}:${password}`), signature) ? role : null;
}

export function isValidSession(token: unknown): token is string {
  return sessionRole(token) !== null;
}

export function isAuthenticated(request: Request) {
  return isValidSession(request.cookies?.[SESSION_COOKIE]);
}

export function passwordRole(input: string): SessionRole | null {
  if (config.adminPassword && signaturesMatch(config.adminPassword, input)) return 'admin';
  return signaturesMatch(config.appPassword, input) ? 'viewer' : null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.cookieSecure,
  maxAge: SESSION_DURATION_MS,
  path: '/',
};

