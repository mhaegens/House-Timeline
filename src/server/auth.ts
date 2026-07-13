import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from './config.js';

export const SESSION_COOKIE = 'house_memory_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function sign(value: string) {
  return createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

export function createSessionToken() {
  const expiresAt = String(Date.now() + SESSION_DURATION_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function isValidSession(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  const [expiresAt, signature] = token.split('.');
  if (!expiresAt || !signature || Number(expiresAt) <= Date.now()) return false;
  const expected = Buffer.from(sign(expiresAt));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function isAuthenticated(request: Request) {
  return isValidSession(request.cookies?.[SESSION_COOKIE]);
}

export function passwordMatches(input: string) {
  const expected = Buffer.from(config.appPassword);
  const received = Buffer.from(input);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.cookieSecure,
  maxAge: SESSION_DURATION_MS,
  path: '/',
};
