import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('production admin password configuration', () => {
  it('rejects production startup without an externally configured admin password', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_PASSWORD', 'viewer-test');
    vi.stubEnv('ADMIN_PASSWORD', '');
    vi.stubEnv('SESSION_SECRET', 'test-session-secret-with-enough-characters');
    const { assertConfig } = await import('./config');
    expect(assertConfig).toThrow('ADMIN_PASSWORD must be configured in production.');
  });
  it('accepts a distinct admin password provided at runtime', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_PASSWORD', 'viewer-test');
    vi.stubEnv('ADMIN_PASSWORD', 'admin-test');
    vi.stubEnv('SESSION_SECRET', 'test-session-secret-with-enough-characters');
    const { assertConfig } = await import('./config');
    expect(assertConfig).not.toThrow();
  });
});
