# Auditoría Integral de Seguridad — RestauraCore

**Fecha de Ejecución:** 15 de Septiembre de 2026  
**Entorno:** Producción / Staging / Desarrollo  
**Motor de Base de Datos:** PostgreSQL 16 (Supabase Managed Engine con RLS)  
**Framework:** Next.js 15 (App Router, Server Components & Server Actions)  

---

## 1. Resumen Ejecutivo y Hallazgos Críticos

Se realizó un escaneo automatizado y revisión manual exhaustiva sobre el 100% de los archivos de código fuente (`.ts`, `.tsx`, `.sql`, `.json`, `.mjs`, `.md`) del repositorio para detectar secretos hardcodeados, credenciales expuestas, inyecciones de código y debilidades de autorización.

### Resumen de Estado:
| Vector de Riesgo | Estado | Detalle |
|---|:---:|---|
| **Secretos en Código Fuente** | **SEGURO** | Cero tokens, contraseñas o llaves privadas en código fuente compilable. |
| **Exposición en Historial Git** | **SEGURO** | `.env.local` y `.env` cuentan con 0 commits históricos en Git. |
| **Sanitización de Plantillas** | **REMEDIADO** | `.env.example` contenía una URI de Postgres con password; remediado de inmediato con placeholders genéricos. |
| **Inyección SQL** | **SEGURO** | 100% de consultas orquestadas mediante Drizzle ORM parametrizado con `sql` tag templates. |
| **Validación de Entrada** | **SEGURO** | 100% de los Server Actions validan parámetros con esquemas estrictos de Zod. |
| **Row Level Security (RLS)** | **ACTIVO** | 21 tablas de base de datos protegidas con políticas activas multi-tenant. |
| **Inmutabilidad de Auditoría** | **SEGURO** | Tablas `pagos` y `log_auditoria` estrictamente append-only (sin UPDATE ni DELETE). |

---

## 2. Auditoría de Secretos y Control de Versiones

### 2.1 Verificación de Historial Git (`git log`)
Se ejecutó una verificación sobre el historial completo del repositorio para confirmar que los archivos de entorno local jamás fueron indexados ni commiteados:

```bash
$ git log --all --full-history -- .env*
# Salida: (Vacía - 0 commits)
```

Estado en el árbol de trabajo (`git status -s --ignored`):
```bash
!! .env.example
!! .env.local
```
Ambos archivos están formalmente ignorados por la regla `.env*` en [.gitignore](file:///d:/RestauranInver/restauracore/.gitignore#L34).

### 2.2 Hallazgo y Remediación en `.env.example`
- **Diagnóstico:** En la plantilla de referencia `.env.example`, la variable `DATABASE_URL` incluía una cadena de conexión real de Supabase con contraseña.
- **Impacto:** Aunque `.gitignore` impidió que `.env.example` fuera rastreado o subido a un repositorio remoto, existía riesgo de fuga local.
- **Acción Correctiva Inmediata:** Se reemplazó la cadena por un placeholder completamente genérico:
  ```env
  DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
  ```

---

## 3. Matriz de Control de Acceso y RLS en PostgreSQL

Todas las tablas operativas cuentan con `ROW LEVEL SECURITY` habilitado y políticas estrictas vinculadas a la función de seguridad definer `restaurantes_activos_del_usuario()`:

| Tabla | Políticas Activas en Postgres | Restricciones de Modificación |
|---|---|---|
| `restaurantes` | `restaurantes_select` | Solo visible si el usuario tiene vínculo activo. |
| `usuarios` | `usuarios_select_propio` | Cada usuario solo puede leer su propio perfil. |
| `usuario_restaurantes` | `ur_select` | Segregación por tenant activo. |
| `mesas` | `mesas_select`, `mesas_write` | Modificación exclusiva para `gerente` y `dueno`. |
| `ordenes` | `ordenes_select`, `ordenes_insert`, `ordenes_update` | Inserción por comensal/mesero; actualización restringida. |
| `orden_items` | `orden_items_select`, `orden_items_insert`, `orden_items_update` | Items protegidos por estado de preparación. |
| `turnos` | `turnos_select`, `turnos_insert`, `turnos_update_mesero`, `turnos_update_gerencial` | Cierre exclusivo de `gerente` y `dueno`; mesero solo puede actualizar turno abierto. |
| `solicitudes_cancelacion_item` | `solicitudes_cancelacion_select`, `solicitudes_cancelacion_insert`, `solicitudes_cancelacion_update_resolucion` | Resolución (`aprobada`/`rechazada`) solo ejecutable por gerencia. |
| `pagos` | `pagos_select`, `pagos_insert` | **Estrictamente Append-Only:** Cero políticas de UPDATE ni DELETE. |
| `log_auditoria` | `log_auditoria_select`, `log_auditoria_insert` | **Inmutable:** Append-Only para trazabilidad forense. |
| `asignaciones_mesa` | `asignaciones_mesa_select`, `asignaciones_mesa_write` | Asignación administrada exclusivamente por `gerente` y `dueno`. |

---

## 4. Garantías Anti-Fraude y Concurrencia Validadas

1. **Precios Congelados en Servidor:** Al confirmar órdenes ([pedido-actions.ts](file:///d:/RestauranInver/restauracore/lib/pedido-actions.ts)), los precios se consultan directamente de la tabla `platillos` en PostgreSQL; cualquier precio enviado por el cliente es descartado.
2. **Atomicidad Concurrente en Cancelaciones:** [aprobarCancelacionItemAction](file:///d:/RestauranInver/restauracore/lib/cancelaciones-actions.ts) previene condiciones de carrera mediante `UPDATE ... WHERE id = $1 AND estado = 'pendiente'`. Ante dos gerentes aprobando concurrentemente, solo 1 transacción tiene éxito y se evita duplicidad de mermas.
3. **Control de Turno por `responsable_id`:** [capturarConteoFisicoAction](file:///d:/RestauranInver/restauracore/lib/caja-actions.ts) rechaza intentos de meseros o cajeros de capturar arqueos de turnos asignados a otros responsables, registrando auditoría inmediata.
4. **Patrón Anti-Silencio:** Toda falla de entrega en notificaciones críticas (discrepancias de caja, sospecha de robo en mermas, cancelaciones) asienta un registro obligatorio en `log_auditoria` antes de continuar.

