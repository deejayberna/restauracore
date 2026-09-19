# Variables de Entorno para Producción en Vercel

Configura estas variables en **Vercel** (`Settings` -> `Environment Variables`).  
Solo marca la casilla **Production**.

---

## 1. Supabase (Base de Datos de Producción)
> *Copia estos valores directamente desde tu archivo `.env.production.local`.*

| Variable | De dónde sale |
| :--- | :--- |
| **`DATABASE_URL`** | Línea 2 de `.env.production.local` (`postgresql://postgres.lzmawhowjxgovxewmray...`) |
| **`NEXT_PUBLIC_SUPABASE_URL`** | Línea 6 de `.env.production.local` (`https://lzmawhowjxgovxewmray.supabase.co`) |
| **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | Línea 7 de `.env.production.local` (`eyJhbGciOi...`) |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Línea 8 de `.env.production.local` (`eyJhbGciOi...`) |

---

## 2. Inteligencia Artificial & Alertas
> *Copia estos valores directamente desde tu archivo `.env.local`.*

| Variable | De dónde sale |
| :--- | :--- |
| **`ANTHROPIC_API_KEY`** | Tu clave de Anthropic en `.env.local` (`sk-ant-api03-...`) |
| **`TELEGRAM_BOT_TOKEN`** | Tu token de bot en `.env.local` (`8951901783:AAFAe3B...`) |
| **`TELEGRAM_CHAT_ID_GERENTE`** | Tu Chat ID en `.env.local` (`423720063`) |

---

## 3. Stripe (Suscripciones)
> *Para los precios, usa los mismos de tu `.env.local`.*

| Variable | Valor sugerido |
| :--- | :--- |
| **`STRIPE_SECRET_KEY`** | Tu clave secreta de Stripe (`sk_live_...` si vas a cobrar en vivo, o `sk_test_...` de tu `.env.local` para pruebas iniciales) |
| **`STRIPE_PRICE_BASICO`** | `price_1UGtAnITGlKs5t7RzvqHoJXi` (de tu `.env.local`) |
| **`STRIPE_PRICE_PRO`** | `price_1UGtAoITGlKs5t7RnZo1l7rx` (de tu `.env.local`) |
| **`STRIPE_PRICE_ENTERPRISE`** | `price_1UGtAoITGlKs5t7RBUG4NOt0` (de tu `.env.local`) |

---

## 4. Seguridad Interna & URL
> *Contraseñas o tokens aleatorios para proteger las rutas internas.*

| Variable | Qué poner |
| :--- | :--- |
| **`CRON_SECRET`** | Cualquier texto largo o clave segura (ejemplo: `restauracore-cron-secret-2026-prod`) |
| **`WEBHOOK_SECRET`** | Cualquier texto largo o clave segura (ejemplo: `restauracore-webhook-secret-2026-prod`) |
| **`NEXT_PUBLIC_APP_URL`** | La URL que te dé Vercel (ejemplo: `https://restauracore.vercel.app` o tu dominio propio) |

---

## 5. Cloudflare Turnstile (Captcha Anti-Abuso en /registro)
> *Genera tu Site Key y Secret Key gratis en el dashboard de Cloudflare -> Turnstile.*

| Variable | Qué poner |
| :--- | :--- |
| **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** | Tu Site Key de Cloudflare Turnstile (visible al cliente en el widget) |
| **`TURNSTILE_SECRET_KEY`** | Tu Secret Key de Cloudflare Turnstile (usada en servidor para validar token) |

---

## 6. Variables Opcionales (Solo si ya las configuraste)

Si aún no las estás usando, **no necesitas agregarlas ahora**:

* **Resend (Correos):** `RESEND_API_KEY` y `RESEND_FROM_EMAIL`. (Si no están, el sistema no enviará emails y usará Telegram).
* **Upstash (Redis):** `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`. (Si no están, el sistema usa protección en memoria automáticamente).
* **Webhook de Stripe:** `STRIPE_WEBHOOK_SECRET`. (Se agrega **después** del primer despliegue cuando ya sepas la URL pública de Vercel y registres el endpoint en Stripe).

