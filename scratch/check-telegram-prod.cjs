const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

// Read .env.production.local
const envPath = path.join(__dirname, '..', '.env.production.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);

if (!match) {
  console.error("DATABASE_URL not found in .env.production.local");
  process.exit(1);
}

const connectionString = match[1];
console.log("Connecting to production DB...");

const sql = postgres(connectionString, { ssl: 'require' });

async function run() {
  try {
    console.log("--- QUERY 1: TABLES ---");
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('clientes_telegram', 'vinculaciones_telegram_pendientes');
    `;
    console.log(JSON.stringify(tables, null, 2));

    console.log("\n--- ALL PUBLIC TABLES ---");
    const allTables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    console.log(allTables.map(t => t.table_name).join(', '));

    console.log("\n--- QUERY 2: RLS ---");
    const rls = await sql`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE tablename IN ('clientes_telegram', 'vinculaciones_telegram_pendientes');
    `;
    console.log(JSON.stringify(rls, null, 2));

    console.log("\n--- POLICIES DETAIL ---");
    const policies = await sql`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd
      FROM pg_policies
      WHERE tablename IN ('clientes_telegram', 'vinculaciones_telegram_pendientes')
      ORDER BY tablename, policyname;
    `;
    console.log(JSON.stringify(policies, null, 2));

    process.exit(0);
  } catch (err) {
    console.error("Error executing queries:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
