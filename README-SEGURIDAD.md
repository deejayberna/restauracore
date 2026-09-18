# Manual de Seguridad Operativa y Recuperación ante Desastres — RestauraCore

Este documento establece los protocolos obligatorios de respaldo, recuperación continua (PITR), gestión de incidentes y ciclo de vida de credenciales de producción para **RestauraCore**.

---

## 1. Activación de Point-in-Time Recovery (PITR) en Supabase

Point-in-Time Recovery (PITR) permite restaurar la base de datos a cualquier segundo específico en el pasado (con granularidad de segundos), protegiendo la operación contra corrupción de datos, eliminaciones accidentales o incidentes graves de seguridad.

### 1.1 Requisitos Previos
- Plan de Supabase **Pro** o **Enterprise**.
- Rol con privilegios de **Owner** o **Admin** en la organización de Supabase.

### 1.2 Proceso Paso a Paso para Activar PITR
1. Ingresa a la consola de [Supabase Dashboard](https://supabase.com/dashboard).
2. Selecciona el proyecto de producción de **RestauraCore** (`[PROJECT_REF]`).
3. En la barra lateral izquierda, dirígete a **Project Settings** (icono de engranaje) -> **Database**.
4. Desplázate hasta la sección **Database Backups**.
5. Localiza el apartado **Point in Time Recovery (PITR)**.
6. Haz clic en **Enable PITR**.
7. Selecciona el período de retención deseado:
   - **7 días** (recomendado para producción estándar).
   - **14 días** o **28 días** (para operaciones de alto volumen o auditoría avanzada).
8. Confirma la activación. Supabase comenzará de inmediato el archivado continuo de los logs de transacciones Write-Ahead Logging (WAL) en almacenamiento duradero de Amazon S3.

> [!IMPORTANT]
> Una vez activado PITR, el archivado WAL toma entre 10 y 15 minutos en establecer el primer punto de restauración válido. Verifica que el estado muestre **"Active"** con el rango de tiempo continuo disponible.

---

## 2. Procedimiento de Restauración ante Falla o Desastre

Ante una contingencia crítica (ej. actualización corrupta o inyección accidental de datos):

### 2.1 Identificación del Punto de Corte (Timestamp Objetivo)
1. Consulta la tabla `log_auditoria` para identificar el segundo exacto previo a la anomalía:
   ```sql
   SELECT id, creado_en, accion, tabla_afectada, registro_id
   FROM log_auditoria
   ORDER BY creado_en DESC
   LIMIT 50;
   ```
2. Determina el timestamp UTC exacto (ej. `2026-09-15 03:42:15 UTC`) inmediatamente anterior al incidente.

### 2.2 Proceso de Restauración Vía Consola de Supabase
1. En Supabase Dashboard, navega a **Project Settings** -> **Database** -> **Backups**.
2. En la pestaña **Point in Time Recovery**, haz clic en **Restore to Point in Time**.
3. Ingresa la fecha y hora exacta identificada en el paso anterior.
4. **Modo de Restauración:**
   - **Restauración en Nuevo Proyecto (Recomendado):** Supabase aprovisionará una base de datos paralela clonada con el estado exacto a ese segundo. Esto permite auditar los datos antes de conmutar tráfico sin interrumpir la base actual.
   - **Restauración in-place (Sobrescritura):** Sobrescribe la base de datos actual (requiere ventana de mantenimiento con la app en modo reposo).
5. Una vez validada la integridad de los datos restaurados, actualiza la variable `DATABASE_URL` en Vercel para apuntar al nuevo endpoint si se usó un clon paralelo.
6. Ejecuta `npx vitest run` para verificar la coherencia funcional completa.

---

## 3. Checklist de Variables de Entorno de Producción (Vercel)

Asegúrate de que las siguientes variables de entorno estén configuradas en **Vercel** (`Production Environment`):

| Variable | Tipo | Propósito | Dónde Obtenerla |
|---|---|---|---|
| `DATABASE_URL` | Secreto | Conexión Postgres para Drizzle ORM (Pooler Transaccional IPv4, puerto 6543) | Supabase Dashboard -> Settings -> Database -> Connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Público | URL del proyecto Supabase para autenticación y Storage | Supabase Dashboard -> Settings -> API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Público | Llave anónima pública de cliente | Supabase Dashboard -> Settings -> API |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreto | Llave con bypass de RLS para tareas internas del servidor | Supabase Dashboard -> Settings -> API -> `service_role` secret |
| `SESSION_SECRET` | Secreto | Clave criptográfica para sellar la cookie `restaurante_activo` | `openssl rand -hex 32` |
| `WEBHOOK_SECRET` | Secreto | Firma de verificación de webhooks entrantes | `openssl rand -hex 32` |
| `CRON_SECRET` | Secreto | Token de autorización Bearer para `/api/cron/reporte-diario` | `openssl rand -hex 32` (coincidente con `vercel.json`) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Secreto | Inferencia para Sugerencias de Ingeniería de Menú | Consola de Anthropic / OpenAI |
| `TELEGRAM_BOT_TOKEN` | Secreto | Despacho de alertas críticas (anti-silencio) a Gerencia/Dueño | BotFather de Telegram |
| `TELEGRAM_CHAT_ID_GERENTE` | Secreto | Identificador del canal/chat de alertas de gerencia | Chat ID de Telegram |
| `RESEND_API_KEY` | Secreto | Envío de correos transaccionales y reporte diario nocturno | Consola de Resend |
| `RESEND_FROM_EMAIL` | Config | Remitente verificado (ej. `notificaciones@restauracore.com`) | Dominio verificado en Resend |
| `UPSTASH_REDIS_REST_URL` | Secreto | Endpoint REST de Redis para Rate Limiting perimetral | Consola de Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | Secreto | Token de autenticación de Upstash Redis | Consola de Upstash |
| `NEXT_PUBLIC_APP_URL` | Público | URL canónica de producción de la app (ej. `https://app.restauracore.com`) | Vercel Project Domains |

---

## 4. Procedimiento de Rotación de Credenciales

Toda rotación debe seguir el principio de **Cero Tiempo de Inactividad (Zero-Downtime)**:

### 4.1 Rotación de `DATABASE_URL` (Contraseña de Base de Datos)
1. En Supabase Dashboard -> **Database Settings** -> **Database Password**, haz clic en **Reset Database Password**.
2. Genera una contraseña de alta entropía (mínimo 24 caracteres alfanuméricos y símbolos).
3. Copia la nueva cadena de conexión en modo **Transaction Pooler (Puerto 6543)**.
4. En Vercel Dashboard -> **Settings** -> **Environment Variables**, edita `DATABASE_URL` con el nuevo valor.
5. Dispara un **Redeploy** de producción sin caché.
6. Monitorea los logs de Vercel y ejecuta una transacción de prueba.

### 4.2 Rotación de `SUPABASE_SERVICE_ROLE_KEY`
1. En Supabase Dashboard -> **Settings** -> **API**, localiza **JWT Secret**.
2. Al regenerar el JWT secret se invalidan todas las llaves anon y service_role previas.
3. Actualiza en Vercel simultáneamente `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
4. Realiza un despliegue inmediato.

### 4.3 Rotación de `CRON_SECRET`
1. Genera un nuevo secreto: `openssl rand -hex 32`.
2. Actualiza `CRON_SECRET` en Vercel Environment Variables.
3. Si utilizas Vercel Cron Jobs mediante encabezados automáticos de Vercel, la actualización es transparente; si utilizas llamadas externas vía curl/monitor, actualiza el header `Authorization: Bearer <nuevo_secret>`.

### 4.4 Rotación de `SESSION_SECRET`
1. Genera una nueva cadena aleatoria de 32 bytes en hexadecimal.
2. Actualiza `SESSION_SECRET` en Vercel.
3. Al desplegar, las sesiones activas de selección de restaurante solicitarán al usuario re-seleccionar su sucursal de trabajo de forma segura y sin pérdida de datos.

