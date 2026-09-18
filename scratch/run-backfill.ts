import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== Ejecutando Backfill Histórico de Pagos ===");
  
  const result = await db.execute(sql`
    INSERT INTO pagos (restaurante_id, orden_id, turno_id, metodo_pago, monto, propina_monto, creado_por, creado_en)
    SELECT
      o.restaurante_id,
      o.id,
      NULL as turno_id,
      COALESCE(NULLIF(o.metodo_pago, '')::metodo_pago, 'efectivo'::metodo_pago),
      o.total,
      COALESCE(o.propina, 0),
      COALESCE(
        o.mesero_id,
        (SELECT ur.usuario_id FROM usuario_restaurantes ur WHERE ur.restaurante_id = o.restaurante_id AND ur.rol IN ('gerente', 'dueno') AND ur.activo = true LIMIT 1),
        (SELECT ur.usuario_id FROM usuario_restaurantes ur WHERE ur.restaurante_id = o.restaurante_id AND ur.activo = true LIMIT 1),
        (SELECT id FROM usuarios LIMIT 1)
      ),
      COALESCE(o.actualizado_en, o.creado_en, NOW())
    FROM ordenes o
    WHERE o.estado = 'pagado'
      AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.orden_id = o.id);
  `);
  
  console.log("Resultado del INSERT:", result);

  const conteo = await db.execute(sql`
    SELECT count(*)::int as total_pagos FROM pagos;
  `);
  console.log("Total filas en pagos tras backfill:", conteo);

  const filas = await db.execute(sql`
    SELECT p.id, p.orden_id, p.metodo_pago, p.monto, p.propina_monto, p.creado_en
    FROM pagos p;
  `);
  console.log("Filas en tabla pagos:", filas);

  process.exit(0);
}

main().catch((e) => {
  console.error("Error en backfill:", e);
  process.exit(1);
});

