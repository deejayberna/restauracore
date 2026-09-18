import { config } from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Cargar estrictamente .env.production.local
const prodEnvPath = path.resolve(process.cwd(), ".env.production.local");
if (!fs.existsSync(prodEnvPath)) {
  console.error("No existe el archivo .env.production.local");
  process.exit(1);
}

const envConfig = config({ path: prodEnvPath, override: true });
if (envConfig.error) {
  console.error("Error al cargar .env.production.local:", envConfig.error);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL no está definida en .env.production.local");
  process.exit(1);
}

try {
  const u = new URL(dbUrl);
  console.log("Conectando a base de datos de PRODUCCIÓN:");
  console.log(`  Host: ${u.host}`);
  console.log(`  User: ${u.username}`);
  console.log(`  Database: ${u.pathname}`);
} catch (e) {
  console.log("DATABASE_URL cargada.");
}

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function runMigrate() {
  console.log("\nIniciando migración programática con Drizzle ORM...");
  const sql = postgres(dbUrl!, { max: 1 });
  const db = drizzle(sql);

  console.log("Aplicando todas las migraciones desde ./db/migrations (0000 a 0005)...");
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "db", "migrations") });
  console.log("✓ Migraciones aplicadas con éxito.");

  // Consultar drizzle.__drizzle_migrations en la base nueva
  const applied: any = await sql`
    SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;
  `;
  console.log("\n--- MIGRACIONES REGISTRADAS EN LA BASE NUEVA (drizzle.__drizzle_migrations) ---");
  console.table(applied);

  await sql.end();
  process.exit(0);
}

runMigrate().catch((err) => {
  console.error("Error en migración:", err);
  process.exit(1);
});

