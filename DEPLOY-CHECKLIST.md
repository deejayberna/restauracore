# DEPLOY-CHECKLIST: Variables de Entorno y Configuración Vercel

> **Fuente de verdad:** Compilado mediante inspección estática exhaustiva de `process.env.*` en el código fuente de `RestauranInver/restauracore` (`lib/`, `app/`, `db/`, `scripts/`, `middleware.ts`).  
> **Fecha de generación:** Septiembre 2026

---

## 📌 Resumen de Ambientes en Vercel

| Ambiente | Base de Datos (Supabase) | Stripe Mode | Propósito |
| :--- | :--- | :--- | :--- |
| **Production** | Proyecto Producción (`lzmawhowjxgovxewmray`) | **Live** (`sk_live_...`) | Tráfico real de usuarios y cobros comerciales legítimos. |
| **Preview** | Proyecto Desarrollo/Staging (`ehdubgdcfxnovykcoyro`) | **Test** (`sk_test_...`) | PRs, ramas de prueba y pre-visualizaciones sin riesgo a datos ni cobros reales. |
| **Development** | Proyecto Desarrollo (`ehdubgdcfxnovykcoyro`) | **Test** (`sk_test_...`) | Ejecución local en `localhost:3000` vía `.env.local`. |

---

## 📋 Checklist de Variables de Entorno

### 1. Base de Datos (Postgres / Drizzle ORM)

| Estado | Variable | Tipo | Ambientes Aplicables | Formato de Ejemplo | Descripción |
| :---: | :--- | :---: | :---: | :--- | :--- |
| [ ] | `DATABASE_URL` | **Sensitive** (Secreta) | **Production**<br>**Preview**<br>**Development** | `postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require` | Connection string de PostgreSQL en modo Transaction Pooler (puerto 6543) para Drizzle ORM.<br>• En **Production**: usar ref `lzmawhowjxgovxewmray`<br>• En **Preview**: usar ref `ehdubgdcfxnovykcoyro` |

---

### 2. Supabase (Auth, Storage & Admin Client)

| Estado | Variable | Tipo | Ambientes Aplicables | Formato de Ejemplo | Descripción |
| :---: | :--- | :---: | :---: | :--- | :--- |
| [ ] | `NEXT_PUBLIC_SUPABASE_URL` | **Pública** | **Production**<br>**Preview**<br>**Development** | `https://[PROJECT_REF].supabase.co` | URL base del proyecto Supabase.<br>• **Production**: `https://lzmawhowjxgovxewmray.supabase.co`<br>• **Preview/Dev**: `https://ehdubgdcfxnovykcoyro.supabase.co` |
| [ ] | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Pública** | **Production**<br>**Preview**<br>**Development** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Clave anónima pública del cliente Supabase para navegador y middleware. |
| [ ] | `SUPABASE_SERVICE_ROLE_KEY` | **Sensitive** (Secreta) | **Production**<br>**Preview**<br>**Development** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Clave administrativa con bypass de RLS. Usada exclusivamente en servidor (`lib/supabase-admin.ts`, limpieza de Storage en `lib/merma-actions.ts`). **NUNCA** exponer con prefijo `NEXT_PUBLIC_`. |

---

### 3. Stripe (Suscripciones y Facturación)

| Estado | Variable | Tipo | Ambientes Aplicables | Formato de Ejemplo | Descripción |
| :---: | :--- | :---: | :---: | :--- | :--- |
| [ ] | `STRIPE_SECRET_KEY` | **Sensitive** (Secreta) | **Production** (Live)<br>**Preview** (Test)<br>**Development** (Test) | `sk_live_51...` (Prod)<br>`sk_test_51...` (Preview/Dev) | Clave de API de Stripe.<br>• **Production**: Clave real en vivo (`sk_live_...`).<br>• **Preview**: Clave de prueba (`sk_test_...`) para evitar transacciones con dinero real. |
| [ ] | `STRIPE_PRICE_BASICO` | **Config** | **Production**<br>**Preview**<br>**Development** | `price_1UGtAnITGlKs5t7R...` | ID de precio recurrente del Plan Básico (creado en Stripe Dashboard). |
| [ ] | `STRIPE_PRICE_PRO` | **Config** | **Production**<br>**Preview**<br>**Development** | `price_1UGtAoITGlKs5t7R...` | ID de precio recurrente del Plan Pro (creado en Stripe Dashboard). |
| [ ] | `STRIPE_PRICE_ENTERPRISE` | **Config** | **Production**<br>**Preview**<br>**Development** | `price_1UGtAoITGlKs5t7R...` | ID de precio recurrente del Plan Enterprise (creado en Stripe Dashboard). |
| [ ] | `STRIPE_WEBHOOK_SECRET` | **Sensitive** (Secreta) | **Production** (Dashboard)<br>**Preview** (Opcional/Test)<br>**Development** (CLI) | `whsec_...` | Secreto de firma del Webhook (`/api/webhooks/stripe`).<br>⚠️ **ATENCIÓN: VER SECCIÓN DE PASOS POSTERIORES**. |

> ⚠️ **IMPORTANTE - `STRIPE_WEBHOOK_SECRET` DE PRODUCCIÓN:**
> - El secreto `whsec_...` generado por `stripe listen` en desarrollo es **exclusivamente local y temporal**.
> - En **Producción**, el webhook secret **NO se puede generar antes de tener el despliegue**, ya que Stripe requiere la URL HTTPS pública definitiva de la aplicación para registrar el endpoint.
> - **Acción requerida:** Este valor se configura como un **paso posterior al primer deploy**.

---

### 4. Telegram (Alertas de Infraestructura y Fallback Administrativo)

| Estado | Variable | Tipo | Ambientes Aplicables | Formato de Ejemplo | Descripción |
| :---: | :--- | :---: | :---: | :--- | :--- |
| [ ] | `TELEGRAM_BOT_TOKEN` | **Sensitive** (Secreta) | **Production**<br>**Preview**<br>**Development** | `8951901783:AAFAe3B9r0x-tcDU1XgRb9...` | Token del bot de Telegram obtenido a través de BotFather (usado por el sistema y notificaciones). |
| [ ] | `TELEGRAM_CHAT_ID_GERENTE` | **Sensitive** (Privada) | **Production**<br>**Preview**<br>**Development** | `423720063` o `-1001234567890` | **Fallback Administrativo Global:** Chat ID personal o canal devOps para recibir alertas de fallos de infraestructura y aviso si un restaurante queda sin canales de notificación configurados. **Las alertas de negocio de los restaurantes se entregan a su propio `telegram_chat_id` registrado en BD**. |

---

### 5. Resend (Correos Transaccionales y Fallback)

| Estado | Variable | Tipo | Ambientes Aplicables | Formato de Ejemplo | Descripción |
| :---: | :--- | :---: | :---: | :--- | :--- |
| [ ] | `RESEND_API_KEY` | **Sensitive** (Secreta) | **Production**<br>**Preview**<br>**Development** | `re_12345678_abcdef...` | API Key de Resend para despacho de correos transaccionales y de alertas. |
| [ ] | `RESEND_FROM_EMAIL` | **Config** | **Production**<br>**Preview**<br>**Development** | `RestauraCore <alertas@tudominio.com>` | Remitente con dominio validado en Resend (en dev/test puede usarse `onboarding@resend.dev`). |
| [ ] | `GERENTE_EMAIL` | **Config** | **Production**<br>**Preview**<br>**Development** | `admin-sistema@tudominio.com` | **Fallback Administrativo Global:** Correo del operador del sistema para recibir avisos de anomalías de infraestructura y caídas de crons. **Las alertas operativas de los clientes se entregan a su `email_alertas` y a los usuarios con rol 'dueno' en BD**. |

---

### 6. Upstash (Redis & Rate Limiting)

| Estado | Variable | Tipo | Ambientes Aplicables | Formato de Ejemplo | Descripción |
| :---: | :--- | :---: | :---: | :--- | :--- |
| [ ] | `UPSTASH_REDIS_REST_URL` | **Sensitive** | **Production**<br>**Preview**<br>**Development** | `https://[endpoint].upstash.io` | URL REST de la instancia Upstash Redis para rate limiting distribuido en serverless Edge/Node. |
| [ ] | `UPSTASH_REDIS_REST_TOKEN` | **Sensitive** (Secreta) | **Production**<br>**Preview**<br>**Development** | `AXabc1234567890...` | Token de acceso REST para Upstash Redis. *(Nota: Si faltan estas variables, el código cuenta con fallback seguro en memoria).* |

---

### 7. Cron & Webhooks Internos

| Estado | Variable | Tipo | Ambientes Aplicables | Formato de Ejemplo | Descripción |
| :---: | :--- | :---: | :---: | :--- | :--- |
| [ ] | `CRON_SECRET` | **Sensitive** (Secreta) | **Production**<br>**Preview** | `32_bytes_hexadecimal_random_token` | Token de seguridad para autenticar las llamadas de Vercel Cron a `/api/cron/reporte-diario` y `/api/cron/prediccion-demanda`. Vercel lo envía automáticamente en el encabezado `Authorization: Bearer <CRON_SECRET>`. Generar con `openssl rand -hex 32`. |
| [ ] | `WEBHOOK_SECRET` | **Sensitive** (Secreta) | **Production**<br>**Preview**<br>**Development** | `32_bytes_hexadecimal_random_token` | Token de validación en header `x-webhook-secret` para `/api/webhooks/alerta-stock`, invocado por Supabase Database Webhooks al insertarse alertas de inventario. |

---

### 8. Aplicación & Inteligencia Artificial

| Estado | Variable | Tipo | Ambientes Aplicables | Formato de Ejemplo | Descripción |
| :---: | :--- | :---: | :---: | :--- | :--- |
| [ ] | `NEXT_PUBLIC_APP_URL` | **Pública** | **Production**<br>**Preview**<br>**Development** | `https://tu-dominio.vercel.app` (o dominio personalizado) | URL canónica de la app. Utilizada en retornos de checkout de Stripe (`success_url`, `cancel_url`) y portal de clientes.<br>• **Production**: `https://app.restauracore.com` o `https://tu-proyecto.vercel.app`<br>• **Preview**: `https://${VERCEL_URL}` o dominio preview asignado.<br>• **Development**: `http://localhost:3000` |
| [ ] | `ANTHROPIC_API_KEY` | **Sensitive** (Secreta) | **Production**<br>**Preview**<br>**Development** | `sk-ant-api03-...` | Clave de API de Anthropic para el motor de IA (`lib/ai/explicaciones.ts` y `lib/ai/prediccionDemanda.ts`). |

---

## 🔍 Variables del Código Analizadas y Descartadas para Vercel

Durante el escaneo exhaustivo se identificaron las siguientes variables que **NO requieren configuración manual** en Vercel:

1. `NODE_ENV`: Administrada automáticamente por Vercel (`production` en deploys).
2. `CI`: Utilizada únicamente por el runner de tests e2e de Playwright (`playwright.config.ts`).
3. `DOTENV_CONFIG_PATH`: Utilizada exclusivamente por scripts locales de CLI (`drizzle.config.ts`, `db/index.ts`) para alternar entre archivos `.env`.
4. `SESSION_SECRET`: **Mención histórica obsoleta**. Aunque figuraba en documentación anterior (`README-SEGURIDAD.md` y `.env.example`), el código fuente real actual no referencia `process.env.SESSION_SECRET`; las sesiones se gestionan mediante tokens de Supabase Auth y cookies de sesión seguras httpOnly verificadas directamente en base de datos.

---

## 🚀 Guía de Configuración por Ambientes en Vercel

Al ingresar a **Vercel Dashboard** > **Project Settings** > **Environment Variables**, configura las opciones de entorno marcando las casillas según corresponda:

```
┌────────────────────────────────────────┬────────────┬─────────┬─────────────┐
│ Variable                               │ Production │ Preview │ Development │
├────────────────────────────────────────┼────────────┼─────────┼─────────────┤
│ DATABASE_URL (Prod)                    │     ✔      │         │             │
│ DATABASE_URL (Dev/Staging)             │            │    ✔    │      ✔      │
│ NEXT_PUBLIC_SUPABASE_URL (Prod)        │     ✔      │         │             │
│ NEXT_PUBLIC_SUPABASE_URL (Dev)         │            │    ✔    │      ✔      │
│ NEXT_PUBLIC_SUPABASE_ANON_KEY (Prod)   │     ✔      │         │             │
│ NEXT_PUBLIC_SUPABASE_ANON_KEY (Dev)    │            │    ✔    │      ✔      │
│ SUPABASE_SERVICE_ROLE_KEY (Prod)       │     ✔      │         │             │
│ SUPABASE_SERVICE_ROLE_KEY (Dev)        │            │    ✔    │      ✔      │
│ STRIPE_SECRET_KEY (Live: sk_live_...)  │     ✔      │         │             │
│ STRIPE_SECRET_KEY (Test: sk_test_...)  │            │    ✔    │      ✔      │
│ STRIPE_PRICE_* (Live Prices)           │     ✔      │         │             │
│ STRIPE_PRICE_* (Test Prices)           │            │    ✔    │      ✔      │
│ STRIPE_WEBHOOK_SECRET (Prod Dashboard) │     ✔      │         │             │
│ STRIPE_WEBHOOK_SECRET (Dev CLI)        │            │    ✔    │      ✔      │
│ CRON_SECRET                            │     ✔      │    ✔    │             │
│ WEBHOOK_SECRET                         │     ✔      │    ✔    │      ✔      │
│ TELEGRAM_BOT_TOKEN                     │     ✔      │    ✔    │      ✔      │
│ TELEGRAM_CHAT_ID_GERENTE               │     ✔      │    ✔    │      ✔      │
│ RESEND_API_KEY                         │     ✔      │    ✔    │      ✔      │
│ RESEND_FROM_EMAIL                      │     ✔      │    ✔    │      ✔      │
│ GERENTE_EMAIL                          │     ✔      │    ✔    │      ✔      │
│ UPSTASH_REDIS_REST_URL                 │     ✔      │    ✔    │      ✔      │
│ UPSTASH_REDIS_REST_TOKEN               │     ✔      │    ✔    │      ✔      │
│ NEXT_PUBLIC_APP_URL                    │     ✔      │    ✔    │      ✔      │
│ ANTHROPIC_API_KEY                      │     ✔      │    ✔    │      ✔      │
└────────────────────────────────────────┴────────────┴─────────┴─────────────┘
```

---

## ⚡ PASO POSTERIOR AL PRIMER DESPLIEGUE: Webhook de Stripe en Producción

No intentes configurar `STRIPE_WEBHOOK_SECRET` de producción antes de desplegar. Sigue este procedimiento una vez obtenido el dominio en Vercel:

1. **Efectuar el 1er Despliegue en Vercel:**  
   Completa el despliegue inicial con las variables anteriores. Copia la URL pública generada (ej. `https://restauracore.vercel.app` o tu dominio personalizado).

2. **Crear el Endpoint en Stripe Dashboard:**  
   - Ve a [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks).
   - Asegúrate de estar en **Modo Live** (o Test si estás configurando un ambiente de staging).
   - Haz clic en **Add an endpoint** (Agregar un endpoint).
   - **Endpoint URL:** `https://tu-dominio.vercel.app/api/webhooks/stripe`
   - **Events to listen to (Eventos a escuchar):**
     - `checkout.session.completed`
     - `customer.subscription.trial_will_end`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`

3. **Obtener el Signing Secret:**  
   - En la página del webhook creado, localiza la sección **Signing secret** y haz clic en **Reveal**.
   - Copia el valor que inicia con `whsec_...`.

4. **Registrar la Variable en Vercel:**  
   - Ve a Vercel > **Settings** > **Environment Variables**.
   - Agrega `STRIPE_WEBHOOK_SECRET` con el valor `whsec_...` copiado, asignándolo a **Production**.
   - **Redespliega el proyecto** (Redeploy) o haz un nuevo push para que la nueva variable entre en vigor.

