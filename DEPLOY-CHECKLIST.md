# Variables de Entorno para Producción en Vercel (DEPLOY-CHECKLIST)

Configura estas variables en **Vercel** (`Project Settings` -> `Environment Variables`).  
Asegúrate de marcar la casilla **Production** y hacer un **Redeploy** para que las funciones Edge y Server Actions tomen los cambios.

---

## 1. Supabase (Base de Datos & Auth de Producción)
> *Copia estos valores directamente desde tu archivo `.env.production.local`.*

| Variable | De dónde sale | Estado en Vercel Production |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | Línea 2 de `.env.production.local` (`postgresql://postgres.lzmawhowjxgovxewmray...`) | ✅ Configurada |
| **`NEXT_PUBLIC_SUPABASE_URL`** | Línea 6 de `.env.production.local` (`https://lzmawhowjxgovxewmray.supabase.co`) | ✅ Configurada |
| **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | Línea 7 de `.env.production.local` (`eyJhbGciOi...`) | ✅ Configurada |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Línea 8 de `.env.production.local` (`eyJhbGciOi...`) | ✅ Configurada |

---

## 2. Super-Administrador del SaaS (/superadmin)
> *Controla quién tiene acceso al panel global de RestauraCore.*

| Variable | Qué poner | Estado en Vercel Production |
| :--- | :--- | :--- |
| **`SUPER_ADMIN_EMAILS`** | Correo del dueño del SaaS (ejemplo: `berna241190@hotmail.com`). Si son varios, separados por coma. | ⚠️ **Requiere verificar valor exacto y redeploy** |
| **`NEXT_PUBLIC_SUPER_ADMIN_EMAILS`** *(Opcional / Recomendado)* | El mismo valor (`berna241190@hotmail.com`). Garantiza que el runtime Edge de Vercel lo compile directamente en el middleware. | ⚠️ Recomendado agregar |

---

## 3. Inteligencia Artificial & Alertas
> *Copia estos valores directamente desde tu archivo `.env.local`.*

| Variable | De dónde sale | Estado en Vercel Production |
| :--- | :--- | :--- |
| **`ANTHROPIC_API_KEY`** | Clave de Anthropic en `.env.local` (`sk-ant-api03-...`) | ✅ Configurada |
| **`TELEGRAM_BOT_TOKEN`** | Token de bot en `.env.local` (`8951901783:AAFAe3B...`) | ✅ Configurada |
| **`TELEGRAM_CHAT_ID_GERENTE`** | Chat ID en `.env.local` (`423720063`) | ✅ Configurada |

---

## 4. Stripe (Suscripciones SaaS)
> *Valores de Stripe para cobros y planes.*

| Variable | Valor sugerido | Estado en Vercel Production |
| :--- | :--- | :--- |
| **`STRIPE_SECRET_KEY`** | Tu clave de Stripe (`sk_live_...` o `sk_test_...`) | ✅ Configurada |
| **`STRIPE_PRICE_BASICO`** | `price_1UGtAnITGlKs5t7RzvqHoJXi` (de `.env.local`) | ✅ Configurada |
| **`STRIPE_PRICE_PRO`** | `price_1UGtAoITGlKs5t7RnZo1l7rx` (de `.env.local`) | ✅ Configurada |
| **`STRIPE_PRICE_ENTERPRISE`** | `price_1UGtAoITGlKs5t7RBUG4NOt0` (de `.env.local`) | ✅ Configurada |

---

## 5. Seguridad Interna & URLs
> *Tokens para proteger cron jobs y webhooks.*

| Variable | Qué poner | Estado en Vercel Production |
| :--- | :--- | :--- |
| **`CRON_SECRET`** | Token seguro para proteger los endpoints cron | ✅ Configurada |
| **`WEBHOOK_SECRET`** | Token seguro para webhooks internos | ✅ Configurada |
| **`NEXT_PUBLIC_APP_URL`** | `https://restauracore.vercel.app` | ✅ Configurada |

---

## 6. Cloudflare Turnstile (Anti-Bot en /registro)
> *Protección invisible contra registros automatizados.*

| Variable | Qué poner | Estado en Vercel Production |
| :--- | :--- | :--- |
| **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** | Site Key pública (para pruebas: `1x00000000000000000000AA`) | ⚠️ Verificar si ya fue ingresada |
| **`TURNSTILE_SECRET_KEY`** | Secret Key privada (para pruebas: `1x0000000000000000000000000000000AA`) | ⚠️ Verificar si ya fue ingresada |

---

## 7. Variables Opcionales
* **Resend (Emails transaccionales):** `RESEND_API_KEY` y `RESEND_FROM_EMAIL`. (Si no están, el sistema envía alertas por Telegram).
* **Upstash Redis:** `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`. (Si no están, el rate limiting opera en memoria del contenedor).
* **Stripe Webhook:** `STRIPE_WEBHOOK_SECRET`. (Registrar en Stripe Dashboard apuntando a `https://restauracore.vercel.app/api/webhooks/stripe`).
