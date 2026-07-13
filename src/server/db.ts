import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

async function createPool(): Promise<pg.Pool> {
  if (config.useInMemoryDatabase) {
    const { newDb } = await import('pg-mem');
    const memory = newDb({ autoCreateForeignKeyIndices: true });
    const adapter = memory.adapters.createPg();
    return new adapter.Pool() as unknown as pg.Pool;
  }
  return new Pool({ connectionString: config.databaseUrl });
}

export const pool = await createPool();

export async function initialiseDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS floors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      plan_path TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS locations (
      id UUID PRIMARY KEY,
      floor_id TEXT NOT NULL REFERENCES floors(id),
      x DOUBLE PRECISION NOT NULL CHECK (x >= 0 AND x <= 1),
      y DOUBLE PRECISION NOT NULL CHECK (y >= 0 AND y <= 1),
      label TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS captures (
      id UUID PRIMARY KEY,
      location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      captured_at TIMESTAMPTZ NOT NULL,
      panorama_path TEXT,
      original_filename TEXT,
      initial_yaw DOUBLE PRECISION NOT NULL DEFAULT 0,
      tags TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS captures_location_date_idx
      ON captures(location_id, captured_at DESC);
  `);

  await pool.query(
    `INSERT INTO floors (id, name, sort_order, plan_path) VALUES
      ('basement', 'Basement', 0, 'basement.svg'),
      ('ground', 'Ground floor', 1, 'ground.svg'),
      ('first', 'First floor', 2, 'first.svg')
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       sort_order = EXCLUDED.sort_order,
       plan_path = EXCLUDED.plan_path`,
  );

}

export async function readState() {
  const floors = await pool.query(
    `SELECT id, name, sort_order AS "sortOrder", plan_path AS "planPath"
     FROM floors ORDER BY sort_order`,
  );
  const locations = await pool.query(
    `SELECT id, floor_id AS "floorId", x, y, label
     FROM locations ORDER BY created_at`,
  );
  const captures = await pool.query(
    `SELECT id, location_id AS "locationId", title, description,
       captured_at AS "capturedAt", panorama_path AS "panoramaPath",
       original_filename AS "originalFilename", initial_yaw AS "initialYaw", tags
     FROM captures ORDER BY captured_at`,
  );
  return { floors: floors.rows, locations: locations.rows, captures: captures.rows };
}
