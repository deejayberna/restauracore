-- ============================================================
-- Trigger de alertas de inventario
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Función que se ejecuta después de cada UPDATE en ingredientes
CREATE OR REPLACE FUNCTION fn_alerta_stock_bajo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_nivel alerta_nivel;
BEGIN
  -- Solo actuar si stock_actual cambió y quedó por debajo del mínimo
  IF NEW.stock_actual >= NEW.stock_minimo THEN
    RETURN NEW;
  END IF;

  -- Determinar nivel: crítico si stock <= 25% del mínimo, bajo si <= 100%
  IF NEW.stock_actual <= (NEW.stock_minimo * 0.25) THEN
    v_nivel := 'critico';
  ELSE
    v_nivel := 'bajo';
  END IF;

  -- Insertar alerta solo si no existe una no atendida del mismo nivel para este ingrediente
  INSERT INTO alertas_inventario (restaurante_id, ingrediente_id, nivel, atendida)
  SELECT NEW.restaurante_id, NEW.id, v_nivel, false
  WHERE NOT EXISTS (
    SELECT 1 FROM alertas_inventario
    WHERE ingrediente_id = NEW.id
      AND nivel = v_nivel
      AND atendida = false
  );

  RETURN NEW;
END;
$$;

-- Crear el trigger en la tabla ingredientes
DROP TRIGGER IF EXISTS trg_alerta_stock_bajo ON ingredientes;
CREATE TRIGGER trg_alerta_stock_bajo
  AFTER UPDATE OF stock_actual ON ingredientes
  FOR EACH ROW
  EXECUTE FUNCTION fn_alerta_stock_bajo();

-- ============================================================
-- CÓMO PROBAR:
-- UPDATE ingredientes SET stock_actual = '0.100' WHERE nombre = 'Pollo A';
-- SELECT * FROM alertas_inventario ORDER BY creado_en DESC LIMIT 5;
-- ============================================================
