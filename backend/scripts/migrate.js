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

async function migrate() {
  const migrationsDirectory = path.join(backendDirectory, 'migrations');
  const migrationFiles = (await fs.readdir(migrationsDirectory))
    .filter((file) => /^\d{8}_.+\.sql$/i.test(file))
    .sort();

  if (migrationFiles.length === 0) {
    throw new Error(`No se encontraron migraciones versionadas en ${migrationsDirectory}`);
  }

  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDirectory, file);
    const sql = await fs.readFile(migrationPath, 'utf8');

    console.log(`Aplicando ${file}...`);
    await pool.query(sql);
    console.log(`Correcto: ${file}`);
  }
}

migrate()
  .catch((error) => {
    console.error('Error al aplicar las migraciones:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
