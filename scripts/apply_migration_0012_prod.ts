import { config } from "dotenv";
import * as path from "path";
import * as fs from "fs";
import postgres from "postgres";

// Cargar estrictamente .env.production.local
const prodEnvPath = path.resolve(process.cwd(), ".env.production.local");
if (!fs.existsSync(prodEnvPath)) {
  console.error("No existe el archivo .env.production.local");
  process.exit(1);
}
config({ path: prodEnvPath, override: true });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL no está definida en .env.production.local");
  process.exit(1);
}

async function run() {
  const sql = postgres(dbUrl!, { max: 1 });

  console.log("=== PASO 3: PRODUCCIÓN — MIGRACIÓN 0012_LOG_SISTEMA ===");

  // 1. SELECT ANTES
  console.log("\n--- 1. ESTADO ANTES DE LA MIGRACIÓN ---");
  const tablaAntes = await sql`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'log_sistema';
  `;
  console.log("Tabla log_sistema existe:", tablaAntes.length > 0 ? "SÍ" : "NO");

  const rlsAntes = await sql`
    SELECT relname, relrowsecurity 
    FROM pg_class 
    WHERE relname = 'log_sistema';
  `;
  console.log("Row Security:", rlsAntes.length > 0 ? rlsAntes[0].relrowsecurity : "N/A");

  const grantsAntes = await sql`
    SELECT grantee, table_name, privilege_type 
    FROM information_schema.role_table_grants 
    WHERE table_name = 'log_sistema' AND grantee IN ('anon', 'authenticated');
  `;
  console.log("Grants anon/authenticated:", grantsAntes.length);

  const indexAntes = await sql`
    SELECT indexname, tablename 
    FROM pg_indexes 
    WHERE tablename = 'log_sistema';
  `;
  console.log("Índices:", indexAntes.map(i => i.indexname));

  // 2. APLICAR MIGRACIÓN EN TRANSACCIÓN
  console.log("\n--- 2. APLICANDO MIGRACIÓN DENTRO DE TRANSACCIÓN ---");
  const migrationSql = fs.readFileSync(path.resolve(process.cwd(), "db/migrations/0012_log_sistema.sql"), "utf-8");
  
  await sql.begin(async (tx) => {
    await tx.unsafe(migrationSql);
  });
  console.log("✓ Transacción completada con éxito.");

  // 3. SELECT DESPUÉS
  console.log("\n--- 3. ESTADO DESPUÉS DE LA MIGRACIÓN ---");
  const tablaDespues = await sql`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'log_sistema';
  `;
  console.log("Tabla log_sistema existe:", tablaDespues.length > 0 ? "SÍ" : "NO");

  const rlsDespues = await sql`
    SELECT relname, relrowsecurity 
    FROM pg_class 
    WHERE relname = 'log_sistema';
  `;
  console.log("Row Security (relrowsecurity):", rlsDespues.length > 0 ? rlsDespues[0].relrowsecurity : "N/A");

  const grantsDespues = await sql`
    SELECT grantee, table_name, privilege_type 
    FROM information_schema.role_table_grants 
    WHERE table_name = 'log_sistema' AND grantee IN ('anon', 'authenticated');
  `;
  console.log("Grants anon/authenticated (debe ser 0):", grantsDespues.length);
  if (grantsDespues.length > 0) {
    console.table(grantsDespues);
  }

  const indexDespues = await sql`
    SELECT indexname, tablename 
    FROM pg_indexes 
    WHERE tablename = 'log_sistema';
  `;
  console.log("Índices existentes:");
  console.table(indexDespues);

  // 4. PRUEBA DE ESCRITURA MÍNIMA CON LA MISMA CONEXIÓN
  console.log("\n--- 4. PRUEBA DE ESCRITURA MÍNIMA (PRUEBA_LOG_SISTEMA) ---");
  
  // Select antes de insertar
  const cuentaAntes = await sql`SELECT count(*)::int as count FROM log_sistema WHERE tipo = 'PRUEBA_LOG_SISTEMA';`;
  console.log("Registros de PRUEBA_LOG_SISTEMA antes:", cuentaAntes[0].count);

  // Insertar UNA sola fila
  const [insertado] = await sql`
    INSERT INTO log_sistema (tipo, origen, servicio, email_dominio, mensaje_error)
    VALUES ('PRUEBA_LOG_SISTEMA', 'alta_registro', 'supabase_auth_smtp', 'prueba-prod.com', 'Verificación mínima de escritura en producción')
    RETURNING id, tipo, origen, servicio, email_dominio, creado_en;
  `;
  console.log("Fila insertada correctamente:");
  console.log({
    id: insertado.id,
    tipo: insertado.tipo,
    origen: insertado.origen,
    servicio: insertado.servicio,
    email_dominio: insertado.email_dominio,
    creado_en: insertado.creado_en
  });

  // Leer por id
  const [leido] = await sql`
    SELECT id, tipo, origen, servicio, email_dominio, creado_en 
    FROM log_sistema 
    WHERE id = ${insertado.id};
  `;
  console.log("Fila leída por id:", leido ? `ID ${leido.id} coincide` : "NO ENCONTRADA");

  // Borrar por id
  const borrado = await sql`
    DELETE FROM log_sistema 
    WHERE id = ${insertado.id}
    RETURNING id;
  `;
  console.log("Fila borrada por id:", borrado.length === 1 ? `ID ${borrado[0].id} borrado` : "ERROR AL BORRAR");

  // Select después de borrar
  const cuentaDespues = await sql`SELECT count(*)::int as count FROM log_sistema WHERE id = ${insertado.id};`;
  console.log("Verificación posterior al borrado (debe ser 0):", cuentaDespues[0].count);

  await sql.end();
  console.log("\n✓ Proceso finalizado limpiamente.");
}

run().catch((err) => {
  console.error("Error ejecutando migración en producción:", err.message);
  process.exit(1);
});
