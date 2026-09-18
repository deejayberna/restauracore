import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Aplicando trigger check_last_dueno en PostgreSQL...");
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION check_last_dueno()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.rol = 'dueno' AND (NEW.rol != 'dueno' OR NEW.activo = false) THEN
        IF (SELECT count(*) FROM usuario_restaurantes 
            WHERE restaurante_id = OLD.restaurante_id 
              AND rol = 'dueno' 
              AND activo = true 
              AND id != OLD.id) = 0 THEN
          RAISE EXCEPTION 'Operación bloqueada: El restaurante no puede quedarse sin un Dueño activo.';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_prevent_last_dueno ON usuario_restaurantes;
    CREATE TRIGGER trg_prevent_last_dueno
    BEFORE UPDATE ON usuario_restaurantes
    FOR EACH ROW EXECUTE FUNCTION check_last_dueno();
  `);
  console.log("Trigger aplicado exitosamente.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

