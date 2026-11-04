const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

const backendDirectory = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendDirectory, '.env') });

const requiredDatabaseSettings = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingSettings = requiredDatabaseSettings.filter((key) => !process.env[key]);

if (missingSettings.length > 0) {
  throw new Error(
    `Falta configurar ${missingSettings.join(', ')} en ${path.join(backendDirectory, '.env')}`
  );
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

const migrationLock = [1464420401, 1];

async function migrate() {
  const migrationsDirectory = path.join(backendDirectory, 'migrations');
  const migrationFiles = (await fs.readdir(migrationsDirectory))
    .filter((file) => /^\d{8}_.+\.sql$/i.test(file))
    .sort();

  if (migrationFiles.length === 0) {
    throw new Error(`No se encontraron migraciones versionadas en ${migrationsDirectory}`);
  }

  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', migrationLock);
    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const appliedMigrations = await client.query(
      'SELECT filename FROM schema_migrations'
    );
    const appliedFiles = new Set(appliedMigrations.rows.map((row) => row.filename));
    let pendingCount = 0;

    for (const file of migrationFiles) {
      if (appliedFiles.has(file)) continue;

      const migrationPath = path.join(migrationsDirectory, file);
      const sql = await fs.readFile(migrationPath, 'utf8');

      console.log(`Aplicando ${file}...`);
      await client.query('BEGIN');

      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      appliedFiles.add(file);
      pendingCount += 1;
      console.log(`Correcto: ${file}`);
    }

    if (pendingCount === 0) {
      console.log('La base de datos ya está actualizada.');
    }
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1, $2)', migrationLock);
    }
    client.release();
  }
}

migrate()
  .catch((error) => {
    console.error('Error al aplicar las migraciones:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
