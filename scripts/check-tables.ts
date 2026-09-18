import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `;
  if (rows.length === 0) {
    console.log("⚠️  No hay tablas en public — la migración no se aplicó");
  } else {
    console.log(`✅ Tablas encontradas (${rows.length}):`);
    rows.forEach((r) => console.log(` - ${r.table_name}`));
  }
  await sql.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
