import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { ZodError } from 'zod';
import {
  createSessionToken,
  isAuthenticated,
  passwordRole,
  sessionRole,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './auth.js';
import { assertConfig, config } from './config.js';
import { initialiseDatabase, pool, readState } from './db.js';
import { captureFieldsSchema, capturePatchSchema, locationPatchSchema, locationSchema, loginSchema, placementSchema } from './schemas.js';

assertConfig();
await fs.mkdir(path.join(config.dataDir, 'uploads'), { recursive: true });
await initialiseDatabase();
if (config.isProduction) {
  const backupDir = path.join(config.dataDir, 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(path.join(backupDir, `archive-${new Date().toISOString().replaceAll(':', '-')}.json`),
    JSON.stringify(await readState(), null, 2), { flag: 'wx', mode: 0o600 });
}

export const app = express();
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", 'data:', 'blob:'],
        "connect-src": ["'self'"],
        "worker-src": ["'self'", 'blob:'],
      },
    },
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/healthz', (_request, response) => response.json({ status: 'ok' }));

app.get('/api/session', (request, response) => {
  const role = sessionRole(request.cookies?.[SESSION_COOKIE]);
  response.set('Cache-Control', 'no-store').json({ authenticated: role !== null, role });
});

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
app.post('/api/login', (request, response) => {
  const key = request.ip ?? 'unknown';
  const now = Date.now();
  for (const [ip, attempt] of loginAttempts) if (attempt.resetAt <= now) loginAttempts.delete(ip);
  const attempt = loginAttempts.get(key) ?? { count: 0, resetAt: now + 5 * 60 * 1000 };
  if (attempt.count >= 20) {
    response.set('Retry-After', String(Math.ceil((attempt.resetAt - now) / 1000)));
    response.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
    return;
  }
  const { password } = loginSchema.parse(request.body);
  const role = passwordRole(password);
  if (!role) {
    attempt.count++;
    loginAttempts.set(key, attempt);
    response.status(401).json({ error: 'Incorrect password.' });
    return;
  }
  loginAttempts.delete(key);
  response.cookie(SESSION_COOKIE, createSessionToken(role), sessionCookieOptions);
  response.json({ authenticated: true, role });
});

app.post('/api/logout', (_request, response) => {
  response.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
  response.json({ authenticated: false });
});

const requireAuthentication: RequestHandler = (request, response, next) => {
  if (!isAuthenticated(request)) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }
  next();
};

app.use('/api', requireAuthentication);
// Enforce permissions before parsing multipart uploads or touching data.
app.use('/api', (request, response, next) => {
  response.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && sessionRole(request.cookies?.[SESSION_COOKIE]) !== 'admin') {
    response.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  next();
});
app.use('/uploads', requireAuthentication, express.static(path.join(config.dataDir, 'uploads'), { fallthrough: false }));
app.use('/plans', requireAuthentication, express.static(config.plansDir, { fallthrough: false }));

app.get('/api/state', async (_request, response) => {
  response.json(await readState());
});

app.post('/api/locations', async (request, response) => {
  const input = locationSchema.parse(request.body);
  const floor = await pool.query('SELECT id FROM floors WHERE id = $1', [input.floorId]);
  if (!floor.rows[0]) { response.status(400).json({ error: 'Floor not found.' }); return; }
  const id = randomUUID();
  const result = await pool.query(
    `INSERT INTO locations (id, floor_id, x, y, label)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, floor_id AS "floorId", x, y, label`,
    [id, input.floorId, input.x, input.y, input.label],
  );
  response.status(201).json(result.rows[0]);
});

app.patch('/api/locations/:id', async (request, response) => {
  const input = locationPatchSchema.parse(request.body);
  const result = await pool.query(
    `UPDATE locations SET x = COALESCE($1, x), y = COALESCE($2, y),
       floor_id = COALESCE($3, floor_id), label = COALESCE($4, label) WHERE id = $5
     RETURNING id, floor_id AS "floorId", x, y, label`,
    [input.x ?? null, input.y ?? null, input.floorId ?? null, input.label ?? null, request.params.id],
  );
  if (!result.rows[0]) {
    response.status(404).json({ error: 'Location not found.' });
    return;
  }
  response.json(result.rows[0]);
});

app.delete('/api/locations/:id', async (request, response) => {
  const files = await pool.query<{ panoramaPath: string | null }>(
    `SELECT panorama_path AS "panoramaPath" FROM captures WHERE location_id = $1`,
    [request.params.id],
  );
  const result = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING id', [request.params.id]);
  if (!result.rows[0]) {
    response.status(404).json({ error: 'Location not found.' });
    return;
  }
  await Promise.all(files.rows.map((row) => removeUpload(row.panoramaPath)));
  response.status(204).end();
});

const storage = multer.diskStorage({
  destination: path.join(config.dataDir, 'uploads'),
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() || '.jpg';
    callback(null, `${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const accepted = ['image/jpeg', 'image/png', 'image/webp'];
    if (!accepted.includes(file.mimetype) || !/\.(jpe?g|png|webp)$/i.test(file.originalname)) {
      callback(new Error('Only stitched JPEG, PNG, or WebP panoramas are supported.'));
      return;
    }
    callback(null, true);
  },
});

app.post('/api/locations/:id/captures', upload.single('panorama'), async (request, response) => {
  try {
    const fields = captureFieldsSchema.parse(request.body);
    const tags = fields.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO captures
        (id, location_id, title, description, captured_at, panorama_path,
         original_filename, initial_yaw, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, location_id AS "locationId", title, description,
         captured_at AS "capturedAt", panorama_path AS "panoramaPath",
         original_filename AS "originalFilename", initial_yaw AS "initialYaw", tags`,
      [
        id,
        request.params.id,
        fields.title,
        fields.description,
        fields.capturedAt,
        request.file ? `/uploads/${request.file.filename}` : null,
        request.file?.originalname ?? null,
        fields.initialYaw,
        tags,
      ],
    );
    response.status(201).json(result.rows[0]);
  } catch (error) {
    if (request.file) await fs.rm(request.file.path, { force: true });
    throw error;
  }
});

app.patch('/api/captures/:id/placement', async (request, response) => {
  const input = placementSchema.parse(request.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const capture = await client.query<{ locationId: string }>(
      'SELECT location_id AS "locationId" FROM captures WHERE id = $1 FOR UPDATE', [request.params.id],
    );
    if (!capture.rows[0]) {
      await client.query('ROLLBACK');
      response.status(404).json({ error: 'Capture not found.' });
      return;
    }
    let locationId = capture.rows[0].locationId;
    // Lock the point so simultaneous corrections cannot split its history inconsistently.
    await client.query('SELECT id FROM locations WHERE id = $1 FOR UPDATE', [locationId]);
    const history = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM captures WHERE location_id = $1', [locationId]);
    if (input.scope === 'capture' && Number(history.rows[0].count) > 1) {
      locationId = randomUUID();
      await client.query('INSERT INTO locations (id, floor_id, x, y, label) VALUES ($1, $2, $3, $4, $5)',
        [locationId, input.floorId, input.x, input.y, input.label]);
      await client.query('UPDATE captures SET location_id = $1 WHERE id = $2', [locationId, request.params.id]);
    } else {
      await client.query('UPDATE locations SET floor_id = $1, x = $2, y = $3, label = $4 WHERE id = $5',
        [input.floorId, input.x, input.y, input.label, locationId]);
    }
    await client.query('COMMIT');
    response.json({ locationId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
});

app.patch('/api/captures/:id', async (request, response) => {
  const input = capturePatchSchema.parse(request.body);
  if (input.locationId) {
    const location = await pool.query('SELECT id FROM locations WHERE id = $1', [input.locationId]);
    if (!location.rows[0]) { response.status(400).json({ error: 'Location not found.' }); return; }
  }
  const result = await pool.query(
    `UPDATE captures SET title = COALESCE($1, title), description = COALESCE($2, description),
       captured_at = COALESCE($3, captured_at), initial_yaw = COALESCE($4, initial_yaw),
       tags = COALESCE($5, tags), location_id = COALESCE($6, location_id) WHERE id = $7
     RETURNING id, location_id AS "locationId", title, description,
       captured_at AS "capturedAt", panorama_path AS "panoramaPath",
       original_filename AS "originalFilename", initial_yaw AS "initialYaw", tags`,
    [input.title ?? null, input.description ?? null, input.capturedAt ?? null, input.initialYaw ?? null,
      input.tags ?? null, input.locationId ?? null, request.params.id],
  );
  if (!result.rows[0]) { response.status(404).json({ error: 'Capture not found.' }); return; }
  response.json(result.rows[0]);
});

app.delete('/api/captures/:id', async (request, response) => {
  const result = await pool.query<{ panoramaPath: string | null; locationId: string }>(
    `DELETE FROM captures WHERE id = $1
     RETURNING panorama_path AS "panoramaPath", location_id AS "locationId"`,
    [request.params.id],
  );
  if (!result.rows[0]) {
    response.status(404).json({ error: 'Capture not found.' });
    return;
  }
  await removeUpload(result.rows[0].panoramaPath);
  const remaining = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM captures WHERE location_id = $1',
    [result.rows[0].locationId],
  );
  if (Number(remaining.rows[0]?.count ?? 0) === 0) {
    await pool.query('DELETE FROM locations WHERE id = $1', [result.rows[0].locationId]);
  }
  response.status(204).end();
});

async function removeUpload(publicPath: string | null) {
  if (!publicPath) return;
  const filename = path.basename(publicPath);
  await fs.rm(path.join(config.dataDir, 'uploads', filename), { force: true });
}

const clientDir = path.resolve(process.cwd(), 'dist/client');
app.use(express.static(clientDir));
app.get('*splat', (_request, response) => response.sendFile(path.join(clientDir, 'index.html')));

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: 'Invalid input.', details: error.issues });
    return;
  }
  if (error instanceof multer.MulterError) {
    response.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof Error && error.message.startsWith('Only stitched')) {
    response.status(400).json({ error: error.message });
    return;
  }
  console.error(error);
  response.status(500).json({ error: 'Something went wrong.' });
};
app.use(errorHandler);

export const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`House Memory is listening on port ${config.port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

