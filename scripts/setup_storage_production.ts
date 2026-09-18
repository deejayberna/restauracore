import { config } from "dotenv";
import * as path from "path";
import * as fs from "fs";
import postgres from "postgres";

const prodEnvPath = path.resolve(process.cwd(), ".env.production.local");
config({ path: prodEnvPath, override: true });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("No DATABASE_URL en .env.production.local");
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

async function setupStorage() {
  console.log("=== VERIFICACIÓN Y CREACIÓN DE BUCKET DE STORAGE EN PRODUCCIÓN ===");

  // 1. Verificar si existe la tabla storage.buckets
  const tableCheck = await sql`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets';
  `;
  if (tableCheck.length === 0) {
    console.error("El esquema storage o la tabla storage.buckets aún no está inicializada en Supabase.");
    process.exit(1);
  }

  // 2. Verificar si existe el bucket 'mermas-evidencia'
  const bucketCheck = await sql`
    SELECT id, name, public, created_at FROM storage.buckets WHERE id = 'mermas-evidencia';
  `;

  if (bucketCheck.length === 0) {
    console.log("Bucket 'mermas-evidencia' NO existe en storage.buckets. Creándolo como PRIVADO...");
    await sql`
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES (
        'mermas-evidencia',
        'mermas-evidencia',
        false,
        10485760, -- 10MB límite
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
      );
    `;
    console.log("✓ Bucket 'mermas-evidencia' creado con éxito (privado: false público).");
  } else {
    console.log("✓ Bucket 'mermas-evidencia' ya existe en producción:", bucketCheck[0]);
  }

  // 3. Aplicar rls.sql para asegurar que las políticas sobre storage.objects y tablas public queden al 100%
  console.log("\nAplicando db/rls.sql consolidado en la base de datos de producción...");
  const rlsPath = path.resolve(process.cwd(), "db", "rls.sql");
  const rlsSql = fs.readFileSync(rlsPath, "utf-8");
  await sql.file(rlsPath);
  console.log("✓ db/rls.sql aplicado con éxito.");

  // 4. Verificar políticas de storage
  const storagePolicies = await sql`
    SELECT schemaname, tablename, policyname, cmd
    FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects'
    ORDER BY policyname;
  `;
  console.log("\n--- POLÍTICAS RLS EN storage.objects ---");
  console.table(storagePolicies);

  await sql.end();
  process.exit(0);
}

setupStorage().catch(err => {
  console.error("Error en setupStorage:", err);
  process.exit(1);
});

