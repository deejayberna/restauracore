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

---

## 3. Inteligencia Artificial & Telegram
> *Copia estos valores desde tus credenciales de Telegram y Anthropic.*

| Variable | Qué poner / De dónde sale | Estado en Vercel Production |
| :--- | :--- | :--- |
| **`ANTHROPIC_API_KEY`** | Clave de API de Anthropic | ✅ Configurada |
| **`TELEGRAM_BOT_TOKEN`** | Token del bot de Telegram entregado por BotFather | ⚠️ Pendiente rotación |
| **`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`** | Username del bot (ej. `RestauraninverBot`) | ⚠️ Requiere verificar |
| **`TELEGRAM_WEBHOOK_SECRET`** | Cadena secreta larga y aleatoria para validar updates de Telegram (`X-Telegram-Bot-Api-Secret-Token`) | ⚠️ **Requerida para el webhook** |
| **`TELEGRAM_CHAT_ID_GERENTE`** | Chat ID del gerente/dueño para alertas directas | ✅ Configurada |

---

## 4. Stripe (Suscripciones SaaS)
> *Valores de Stripe para cobros y planes.*

| Variable | Valor sugerido | Estado en Vercel Production |
| :--- | :--- | :--- |
| **`STRIPE_SECRET_KEY`** | Tu clave de Stripe (`sk_live_...` o `sk_test_...`) | ✅ Configurada |
| **`STRIPE_PRICE_BASICO`** | Price ID plan Básico | ✅ Configurada |
| **`STRIPE_PRICE_PRO`** | Price ID plan Pro | ✅ Configurada |
| **`STRIPE_PRICE_ENTERPRISE`** | Price ID plan Enterprise | ✅ Configurada |

---

## 5. Seguridad Interna & URLs
> *Tokens para proteger cron jobs y webhooks.*

| Variable | Qué poner | Estado en Vercel Production |
| :--- | :--- | :--- |
| **`CRON_SECRET`** | Token seguro para proteger los endpoints cron | ✅ Configurada |
| **`WEBHOOK_SECRET`** | Token seguro para webhooks internos | ✅ Configurada |
| **`TELEGRAM_WEBHOOK_SECRET`** | Token secreto configurado en el webhook de Telegram (`secret_token`) | ⚠️ **Configurar en Vercel** |
| **`NEXT_PUBLIC_APP_URL`** | URL canónica de producción en Vercel | ✅ Configurada |

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
