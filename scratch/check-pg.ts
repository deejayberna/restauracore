import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== 1. ENUM VALUES FOR rol ===");
  const enums = await db.execute(sql`
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'rol'
    ORDER BY e.enumsortorder;
  `);
  console.log("pg_enum rol:", enums);

  const enumRange = await db.execute(sql`
    SELECT enum_range(NULL::rol) as roles;
  `);
  console.log("enum_range:", enumRange);

  console.log("\n=== 3. PAGOS ROW COUNT (TOTAL & HISTORIC) ===");
  const pagosCount = await db.execute(sql`
    SELECT count(*)::int as total_pagos FROM pagos;
  `);
  console.log("Total filas en pagos:", pagosCount);

  const ordenesCount = await db.execute(sql`
    SELECT estado, count(*)::int as total FROM ordenes GROUP BY estado;
  `);
  console.log("Conteo de órdenes por estado:", ordenesCount);

  const pagosSinOrden = await db.execute(sql`
    SELECT count(*)::int as total FROM pagos p
    JOIN ordenes o ON o.id = p.orden_id;
  `);
  console.log("Pagos vinculados a órdenes:", pagosSinOrden);

  console.log("\n=== 4. PG_POLICIES FOR pagos & solicitudes_cancelacion_item ===");
  const policies = await db.execute(sql`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd
    FROM pg_policies
    WHERE tablename IN ('pagos', 'solicitudes_cancelacion_item', 'asignaciones_mesa')
    ORDER BY tablename, policyname;
  `);
  console.log("Políticas RLS en Postgres:", policies);

  process.exit(0);
}

main().catch((e) => {
  console.error("Error in check-pg:", e);
  process.exit(1);
});

