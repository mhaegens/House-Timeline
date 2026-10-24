import path from 'node:path';

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://housememory:housememory@localhost:5432/housememory',
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data')),
  plansDir: path.resolve(process.env.PLANS_DIR ?? path.join(process.cwd(), 'plans')),
  appPassword: process.env.APP_PASSWORD ?? (isProduction ? '' : 'house'),
  adminPassword: process.env.ADMIN_PASSWORD ?? (isProduction ? '' : 'admin123'),
  sessionSecret: process.env.SESSION_SECRET ?? (isProduction ? '' : 'local-development-secret'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  useInMemoryDatabase: process.env.USE_IN_MEMORY_DB === 'true',
  isProduction,
};

export function assertConfig() {
  if (!config.appPassword) {
    throw new Error('APP_PASSWORD must be configured in production.');
  }
  if (!config.sessionSecret || config.sessionSecret.length < 24) {
    throw new Error('SESSION_SECRET must contain at least 24 characters.');
  }
  if (config.adminPassword && config.adminPassword === config.appPassword) {
    throw new Error('ADMIN_PASSWORD must differ from the viewer APP_PASSWORD.');
  }
}

