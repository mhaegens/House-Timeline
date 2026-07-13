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
  passwordMatches,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './auth.js';
import { assertConfig, config } from './config.js';
import { initialiseDatabase, pool, readState } from './db.js';
import { captureFieldsSchema, locationPatchSchema, locationSchema, loginSchema } from './schemas.js';

assertConfig();
await fs.mkdir(path.join(config.dataDir, 'uploads'), { recursive: true });
await initialiseDatabase();

const app = express();
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
  response.json({ authenticated: isAuthenticated(request) });
});

app.post('/api/login', (request, response) => {
  const { password } = loginSchema.parse(request.body);
  if (!passwordMatches(password)) {
    response.status(401).json({ error: 'Incorrect password.' });
    return;
  }
  response.cookie(SESSION_COOKIE, createSessionToken(), sessionCookieOptions);
  response.json({ authenticated: true });
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
app.use('/uploads', requireAuthentication, express.static(path.join(config.dataDir, 'uploads'), { fallthrough: false }));
app.use('/plans', requireAuthentication, express.static(config.plansDir, { fallthrough: false }));

app.get('/api/state', async (_request, response) => {
  response.json(await readState());
});

app.post('/api/locations', async (request, response) => {
  const input = locationSchema.parse(request.body);
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
    `UPDATE locations SET x = $1, y = $2 WHERE id = $3
     RETURNING id, floor_id AS "floorId", x, y, label`,
    [input.x, input.y, request.params.id],
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
    if (!accepted.includes(file.mimetype)) {
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

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`House Memory is listening on port ${config.port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
