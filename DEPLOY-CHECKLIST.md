# Variables de Entorno para Producción en Vercel (DEPLOY-CHECKLIST)

Configura estas variables en **Vercel** (`Project Settings` -> `Environment Variables`).  
Asegúrate de marcar la casilla del entorno correspondiente (**Production** para valores en vivo) y realizar un **Redeploy** tras modificarlas para que las funciones Serverless y Server Actions tomen los cambios.

> [!IMPORTANT]
> **Convención de Visibilidad y Seguridad:**
> - Toda variable con prefijo **`NEXT_PUBLIC_*`** se expone y compila directamente en el bundle JavaScript del cliente web. En Vercel debe configurarse como **Config** (texto plano, no sensible).
> - Toda variable sin prefijo (secretos de backend, llaves de API privadas, tokens y credenciales de BD) debe configurarse como **Secret / Sensitive** en Vercel.

---

## 1. Supabase (Base de Datos & Auth de Producción)
> *Copia estos valores directamente desde tu archivo `.env.production.local`.*

| Variable | Tipo en Vercel | De dónde sale / Descripción |
| :--- | :---: | :--- |
| **`DATABASE_URL`** | **Secret** | Connection string a PostgreSQL (Pooler Supabase, puerto 6543) |
| **`NEXT_PUBLIC_SUPABASE_URL`** | **Config** | URL del proyecto Supabase (`https://<ref>.supabase.co`) |
| **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | **Config** | Llave pública anónima de Supabase (JWT público) |
| **`SUPABASE_SERVICE_ROLE_KEY`** | **Secret** | Llave administrativa de servicio Supabase (acceso total con bypass RLS) |

---

## 2. Super-Administrador del SaaS (/superadmin) y Respaldo Administrativo

| Variable | Tipo en Vercel | Qué poner / Rol del sistema |
| :--- | :---: | :--- |
| **`SUPER_ADMIN_EMAILS`** | **Config** | Correo(s) autorizados para acceder al panel `/superadmin` (ejemplo: `berna241190@hotmail.com`). Si son varios, separados por coma. |
| **`GERENTE_EMAIL`** | **Config** | Correo administrativo global del sistema. **Rol:** Respaldo administrativo de emergencia (fallback si un restaurante no tiene configurado `email_alertas` ni usuarios dueños vinculados, o destinatario de tickets de soporte global). **NUNCA** recibe las alertas operativas cotidianas de los restaurantes. |

---

## 3. Inteligencia Artificial & Telegram Bot
> *Credenciales para generación de predicciones y notificaciones multicanal.*

| Variable | Tipo en Vercel | Qué poner / Descripción |
| :--- | :---: | :--- |
| **`ANTHROPIC_API_KEY`** | **Secret** | Clave de API de Anthropic (Claude 3.5 Sonnet para predicción de demanda) |
| **`TELEGRAM_BOT_TOKEN`** | **Secret** | Token secreto del bot entregado por `@BotFather` |
| **`TELEGRAM_BOT_USERNAME`** | **Config** | Username del bot en Telegram (ej. `RestauraninverBot`) para generación de enlaces |
| **`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`** | **Config** | Mismo username expuesto al frontend para códigos QR y enlaces de vinculación |
| **`TELEGRAM_WEBHOOK_SECRET`** | **Secret** | Cadena aleatoria secreta para validar updates del bot mediante el header `X-Telegram-Bot-Api-Secret-Token` |
| **`TELEGRAM_CHAT_ID_GERENTE`** | **Config** | Chat ID del administrador para alertas técnicas globales |

---

## 4. Stripe (Suscripciones SaaS)

| Variable | Tipo en Vercel | Qué poner |
| :--- | :---: | :--- |
| **`STRIPE_SECRET_KEY`** | **Secret** | Clave secreta de Stripe (`sk_live_...` para cobros reales) |
| **`STRIPE_PRICE_BASICO`** | **Config** | Price ID del Plan Básico (`price_...`) |
| **`STRIPE_PRICE_PRO`** | **Config** | Price ID del Plan Pro (`price_...`) |
| **`STRIPE_PRICE_ENTERPRISE`** | **Config** | Price ID del Plan Enterprise (`price_...`) |
| **`STRIPE_WEBHOOK_SECRET`** | **Secret** | Secreto de firma del endpoint webhook (`whsec_...`) |

---

## 5. Stripe en Modo Live (Directrices de Configuración)

1. **Recreación de Catálogo por Modo:** En Stripe, los productos y precios no se comparten entre modo Test y modo Live. Se deben crear los productos (Básico, Pro, Enterprise) en el Dashboard de Stripe en **modo Live**, generando nuevos IDs de precio (`price_...`).
2. **Nuevos Price IDs:** Reemplazar en Vercel Production las variables `STRIPE_PRICE_BASICO`, `STRIPE_PRICE_PRO` y `STRIPE_PRICE_ENTERPRISE` con los identificadores generados en modo Live.
3. **Webhook Independiente por Modo:** En el Dashboard de Stripe en modo Live, registrar el endpoint de webhook apuntando a `https://restautom.vercel.app/api/webhooks/stripe`, seleccionando los eventos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   Copiar la clave de firma (`whsec_...`) en `STRIPE_WEBHOOK_SECRET` de Vercel Production.
4. **Aislamiento Estricto de Entornos:** La clave secreta Live (`sk_live_...`) **NUNCA** debe colocarse en las ramas Preview ni Development. Vercel Preview debe continuar operando con claves Test (`sk_test_...`).

---

## 6. Seguridad Interna, URLs & Anti-Bot

| Variable | Tipo en Vercel | Qué poner |
| :--- | :---: | :--- |
| **`CRON_SECRET`** | **Secret** | Token seguro para proteger los endpoints `/api/cron/*` en el header `Authorization: Bearer <CRON_SECRET>` |
| **`WEBHOOK_SECRET`** | **Secret** | Token seguro para webhooks internos de sincronización |
| **`NEXT_PUBLIC_APP_URL`** | **Config** | URL canónica de producción: `https://restautom.vercel.app` |
| **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** | **Config** | Site Key pública de Cloudflare Turnstile para el formulario `/registro` |
| **`TURNSTILE_SECRET_KEY`** | **Secret** | Secret Key privada de Cloudflare Turnstile |

---

## 7. Variables Opcionales

* **Resend (Emails transaccionales):** `RESEND_API_KEY` (Secret) y `RESEND_FROM_EMAIL` (Config). Si no se configuran, las notificaciones críticas se despachan vía Telegram.
* **Upstash Redis:** `UPSTASH_REDIS_REST_URL` (Config) y `UPSTASH_REDIS_REST_TOKEN` (Secret). Si no se configuran, el rate limiting opera con almacén en memoria en el contenedor.

---

## 8. Cron Jobs y Cobertura de Zonas Horarias

Configurados en `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/prediccion-demanda", "schedule": "0 3 * * *" },
    { "path": "/api/cron/reporte-diario", "schedule": "0 5 * * *" },
    { "path": "/api/cron/recordatorio-trial", "schedule": "0 14 * * *" }
  ]
}
```

- **`reporte-diario` (`0 5 * * *` = 05:00 UTC):**
  - El handler valida que la hora local del restaurante sea exactamente las 23:00 (`horaLocal === 23`).
  - Con la frecuencia actual de 1 ejecución diaria, **únicamente atiende a restaurantes en zona horaria UTC-6** (`America/Mexico_City`), donde las 05:00 UTC son las 23:00 locales.
  - Restaurantes en UTC-7 (Hermosillo/Mazatlán, 22:00 locales), UTC-8 (Tijuana, 21:00 locales) o UTC-5 (Cancún, 00:00 locales) no son procesados por omisión de horario.
  - **Requisito para múltiples zonas horarias:** Para atender otras zonas respetando el corte de las 23:00 locales se requiere ejecución horaria (`0 * * * *`). Esto requiere el **plan Pro de Vercel** (el plan Hobby solo permite ejecuciones con frecuencia diaria).
- **`recordatorio-trial` (`0 14 * * *` = 14:00 UTC / 08:00 CDMX):**
  - Se ejecuta diariamente. Calcula los días restantes (2 días y 1 día) utilizando la fecha local del restaurante (`YYYY-MM-DD`).
  - NO envía recordatorios a cuentas de trial vencidas.
  - Se apoya en la restricción atómica `UNIQUE(restaurante_id, dias_restantes)` en `recordatorios_trial_enviados` para garantizar idempotencia y evitar envíos duplicados.
- **`prediccion-demanda` (`0 3 * * *` = 03:00 UTC / 21:00 CDMX):**
  - Ejecución diaria para proyección de compras e insumos del día siguiente con IA. Requiere `ANTHROPIC_API_KEY`.

---

## 9. Turnstile en Producción

Para habilitar la protección anti-bot real en `/registro` y no depender de claves de prueba:

1. **Crear Widget en Cloudflare Turnstile:**
   - En el Dashboard de Cloudflare, ve a **Turnstile** -> **Add Widget**.
   - **Widget name:** `RestauraCore Prod` (o nombre identificable).
   - **Domains / Hostnames:** Agrega `restautom.vercel.app` (y dominios adicionales o de preview si aplica).
   - **Widget Mode:** Selecciona **Managed** (Recomendado).
2. **Copiar Credenciales:**
   - **Site Key:** Clave pública (comienza usualmente con `0x4...`).
   - **Secret Key:** Clave privada para verificación server-side.
3. **Configurar en Vercel (`Project Settings` -> `Environment Variables`):**
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: Configurar como **Config** (texto plano, expuesto al cliente).
   - `TURNSTILE_SECRET_KEY`: Configurar como **Secret / Sensitive** (privado del backend).
4. **Redeploy sin Caché:**
   - Realizar un **Redeploy** (marcando *Redeploy without existing build cache*) para asegurar que Next.js compile `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en el bundle del frontend y las Server Actions / funciones serverless tengan acceso a `TURNSTILE_SECRET_KEY`.

---

## 10. Migración a Dominio Propio (Cuando haya al menos 5 clientes)

Cuando el SaaS pase de `restautom.vercel.app` a un dominio personalizado propio (ej. `app.restauracore.com`), se deben actualizar los siguientes puntos:

1. **Dominio en Vercel:**
   - En `Project Settings` -> `Domains`, agregar el nuevo dominio y configurar los registros DNS (CNAME / A) correspondientes.
2. **Variable `NEXT_PUBLIC_APP_URL`:**
   - Actualizar en Vercel Production a `https://tudominio.com` y hacer redeploy.
3. **Supabase Auth (Site URL y Redirect URLs):**
   - En el Dashboard de Supabase (`Authentication` -> `URL Configuration`):
     - **Site URL:** Actualizar a `https://tudominio.com`.
     - **Redirect URLs:** Agregar `https://tudominio.com/**` y rutas de callback pertinentes.
4. **Endpoint de Webhook de Stripe:**
   - En el Dashboard de Stripe (en modo Live y Test según corresponda):
     - Actualizar el endpoint a `https://tudominio.com/api/webhooks/stripe`.
     - Si se genera un nuevo secreto de firma, actualizar `STRIPE_WEBHOOK_SECRET` en Vercel.
5. **Hostnames del Widget de Cloudflare Turnstile:**
   - En el Dashboard de Cloudflare -> Turnstile -> editar widget:
     - Agregar el nuevo dominio a la lista de dominios autorizados.
6. **Re-registro del Webhook de Telegram:**
   - Con `NEXT_PUBLIC_APP_URL` configurado con el nuevo dominio (o pasándolo en el entorno), ejecutar `npx tsx scripts/register-telegram-webhook.ts`. El script construye automáticamente la URL hacia `/api/webhooks/telegram-bot` usando `NEXT_PUBLIC_APP_URL` y lee `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET` para registrar el webhook ante Telegram de forma segura.
7. **Email Transaccional (Resend o SMTP propio en Supabase):**
   - Configurar y verificar el dominio propio en Resend (registros SPF, DKIM, DMARC, MX) y actualizar `RESEND_FROM_EMAIL` (ej. `noreply@tudominio.com`), o configurar SMTP propio con dicho dominio en Supabase Auth.
8. **CSP (Content Security Policy):**
   - La directiva de Content Security Policy en `next.config.ts` utiliza `'self'` para orígenes de la aplicación, por lo que **no requiere cambios** al cambiar de dominio.

> [!NOTE]
> **Correo transaccional sin dominio propio:**  
> Los servicios de correo predeterminados incluidos en Supabase Auth y las cuentas gratuitas de Resend sin dominio verificado **únicamente entregan correos a la misma cuenta del propietario**. Mientras no se cuente con un dominio propio verificado, el envío fiable de correos de confirmación de cuenta, invitaciones a empleados y recuperación de contraseñas para terceros requiere configurar en Supabase Auth un proveedor SMTP que permita verificar un solo remitente (por ejemplo **Brevo**) o una cuenta de **Gmail con contraseña de aplicación**.

---

## 11. Plantilla de Correo para Restablecer Contraseña (Supabase Auth)

Para que el restablecimiento de contraseña funcione de forma consistente entre diferentes dispositivos y navegadores (evitando la limitación del `code_verifier` de PKCE restringido al navegador de solicitud), utiliza el enlace directo con `token_hash`:

### Orden de ejecución obligatorio:
1. **Primero:** Realizar el deploy del código a producción en Vercel (para que `/restablecer-contrasena` ya soporte el parámetro `token_hash`).
2. **Segundo:** Pegar y guardar la plantilla en el panel de Supabase.

### Configuración en el panel de Supabase:
1. Dirígete a **Authentication** -> **URL Configuration**:
   - **Site URL:** Debe ser exactamente `https://restautom.vercel.app` (sin barra al final).
   - **Redirect URLs:** Asegúrate de tener agregada la URL canónica:
     `https://restautom.vercel.app/restablecer-contrasena`
2. Dirígete a **Authentication** -> **Email Templates** -> **Reset Password**.
3. Reemplaza el enlace del cuerpo del mensaje por la siguiente URL:

```html
<h2>Restablecer contraseña</h2>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en RestauraCore.</p>
<p>Haz clic en el siguiente enlace para ingresar tu nueva contraseña:</p>
<p>
  <a href="{{ .SiteURL }}/restablecer-contrasena?token_hash={{ .TokenHash }}&type=recovery">
    Restablecer mi contraseña
  </a>
</p>
<p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
```

---

## 12. Configuración de SMTP Propio en Supabase Auth

Supabase incluye un servicio de correo predeterminado estrictamente para pruebas internas que **únicamente entrega correos a los miembros de la organización del proyecto** (y con un límite estricto de mensajes por hora). Además, en el plan gratuito de Supabase, las plantillas de correo (**Email Templates**) solo se pueden editar y personalizar si se habilita un servidor SMTP propio (*Custom SMTP*).

Para habilitar el envío real y fiable a terceros (incluyendo recuperación de contraseña, invitaciones a personal y confirmaciones de cuenta para cualquier usuario externo):

### Pasos de configuración con Gmail dedicado:
1. **Crear o utilizar una cuenta de Gmail dedicada** (ej. `restauracore.notificaciones@gmail.com`).
2. **Activar Verificación en dos pasos (2FA)** en la cuenta de Google (Seguridad -> Verificación en dos pasos).
3. **Generar una Contraseña de Aplicación:**
   - En la configuración de seguridad de Google, dirigirse a **Contraseñas de aplicaciones**.
   - Crear una nueva (nombre: ej. `Supabase Auth`).
   - Google generará una contraseña de 16 caracteres.
4. **Configurar Custom SMTP en Supabase Dashboard:**
   - Ir a **Project Settings** -> **Authentication** -> sección **SMTP Settings**.
   - Activar la casilla **Enable Custom SMTP**.
   - **Sender email:** La dirección de Gmail del paso 1 (ej. `restauracore.notificaciones@gmail.com`). *El remitente debe ser igual al usuario autenticado en SMTP.*
   - **Sender name:** `RestauraCore` (o el nombre comercial de la plataforma).
   - **Host:** `smtp.gmail.com`
   - **Port number:** `465`
   - **User:** La dirección de Gmail completa (ej. `restauracore.notificaciones@gmail.com`).
   - **Password:** La contraseña de aplicación de 16 caracteres generada en el paso 3 (sin espacios). *Nunca registrar contraseñas reales ni secretos en el repositorio.*
5. **Guardar cambios.**

> [!IMPORTANT]
> **Prueba obligatoria con correo ajeno:**  
> Antes de dar por cerrada la tarea, debe probarse la recuperación de contraseña solicitándola para un correo ajeno (que no pertenezca a la organización ni a los administradores del proyecto en Supabase) para certificar la recepción real del correo y validar que el enlace abre `/restablecer-contrasena` con el formulario de nueva contraseña listo.



