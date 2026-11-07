const path = require("node:path");
const { Pool } = require("pg");
const dotenv = require("dotenv");
const { aplicarMigraciones } = require("../src/utils/migrar");

const backendDirectory = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(backendDirectory, ".env") });

const requiredDatabaseSettings = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missingSettings = requiredDatabaseSettings.filter((key) => !process.env[key]);

if (missingSettings.length > 0) {
  throw new Error(
    `Falta configurar ${missingSettings.join(", ")} en ${path.join(backendDirectory, ".env")}`,
  );
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

aplicarMigraciones(pool)
  .catch((error) => {
    console.error("Error al aplicar las migraciones:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
