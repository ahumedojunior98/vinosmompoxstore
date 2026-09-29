# Mercado Pago Checkout Pro — arquitectura, producción y operación

Tienda: Next.js 16 (App Router) + Firestore, moneda **COP**. Integración
**Checkout Pro vía Preferences API** (el servidor crea la preferencia, el
navegador redirige a Mercado Pago, el webhook confirma). Fuentes oficiales:
`mercadopago.com.co/developers` — Checkout Pro, Credenciales, Webhooks.

> PayU se conserva intacto (rutas `/api/payu/*`, `src/lib/payu*.js`) pero ya
> no se ofrece en la UI. Rollback = volver a poner `"PayU"` en
> `METODOS_PAGO` (`src/lib/tienda.js`).

## 1. Flujo

```
Cliente → POST /api/mp/crear-preferencia → orden `pending` (total del servidor)
→ POST api.mercadopago.com/checkout/preferences → redirect a
   sandbox_init_point (pruebas) o init_point (real)
→ MP POST /api/mp/webhook?type=payment&data.id=ID (única fuente de verdad)
→ /pago/resultado-mp consulta GET /api/mp/estado por polling
```

## 2. Variables (nombres en `.env.example`; valores solo en el deploy)

| Variable | Dónde se consigue |
|---|---|
| `MP_ENV=sandbox\|production` | La defines tú; debe coincidir con el tipo de token. |
| `MP_ACCESS_TOKEN` (solo servidor) | Tus integraciones → tu app → Credenciales de prueba (`TEST-...`) o producción (`APP_USR-...`). |
| `NEXT_PUBLIC_MP_PUBLIC_KEY` | Misma pantalla (`TEST-...` / `APP-...`). |
| `MP_WEBHOOK_SECRET` (solo servidor) | Tus integraciones → tu app → Webhooks → Configurar notificación → Guardar → revelar clave. |
| `MP_APP_URL` (fallback `PAYU_APP_URL`/`NEXT_PUBLIC_APP_URL`) | Dominio público. En prod exige `https` sin localhost. |

Reglas fail-fast: `TEST-` en production se rechaza; `APP_USR-` con
`sandbox` se rechaza (evita cobros reales desde dev); señales
contradictorias lanzan `MP_ENV_CONFLICTO`.

## 3. Webhook `/api/mp/webhook` (POST, 200 siempre salvo 5xx transitorio)

1. Solo tópico `payment`. Sin `data.id` → ack ignorado.
2. Valida `x-signature` HMAC-SHA256 con el secret
   (`id:{data.id};request-id:{x-request-id};ts:{ts};`). Inválida → ack sin tocar nada.
3. **Verifica contra la API** (`GET /v1/payments/{id}`), nunca contra el aviso.
   Si MP no responde → 503 para que reintente (reintentos cada ~15 min).
4. Cruce de entorno (`live_mode` vs `mp.env` vs `MP_ENV`) jamás aprueba cruzado.
5. Transición atómica: dedup por `paymentId|status` (el mismo pago avisa
   `pending` y luego `approved`), `paid` terminal (solo pasa a `refunded`
   informativo, sin re-stockear), monto (±0.5 COP) y moneda verificados,
   stock una vez (`mp.stockDescontado`), auditoría en `mp.history`.
6. `GET` de cortesía para quien abra la URL.

Estados MP → interno: `approved`→paid, `rejected`/`cancelled`→rejected,
`refunded`/`charged_back`→refunded, `pending`/`in_process`/`in_mediation`/
`authorized`→pending, resto→error.

## 4. Retorno `/pago/resultado-mp` — no es autoridad

Lee `/api/mp/estado`; `POST /api/mp/cancelar` solo `pending → cancelled`.

## 5. Reconciliación (solo lectura, nunca auto-aprueba)

`GET /api/mp/reconciliar?reference=` devuelve estado local + búsqueda
autoritativa en MP por `external_reference` (`/v1/payments/search`) y marca
`diverge:true` si MP muestra aprobado y local no. Guía incluida en la respuesta.

## 6. Despliegue a producción

1. En Developers: app creada, credenciales **producción** (`APP_USR-...`),
   Webhooks configurado a `https://TU-DOMINIO/api/mp/webhook` (HTTPS válido,
   pública, sin auth) con secret guardado.
2. En el hosting: `MP_ENV=production`, `MP_ACCESS_TOKEN` real,
   `NEXT_PUBLIC_MP_PUBLIC_KEY` real, `MP_WEBHOOK_SECRET`,
   `MP_APP_URL=https://TU-DOMINIO`, resto de `.env.example`.
3. Rollback: `MP_ENV=sandbox` + token `TEST-...`; órdenes `paid` no se tocan.

## 7. Pruebas sandbox

1. Crea **usuarios de prueba** (Developers → Cuentas de prueba): un vendedor
   y un comprador con saldo/tarjetas de prueba.
2. Paga con el comprador de prueba en `sandbox_init_point`.
3. Tarjetas y escenarios (aprobado/rechazado/pendiente): doc oficial
   "Cuentas de prueba" de Checkout Pro.
4. Verifica `paid` en `/pago/resultado-mp`, `paymentId` en Firestore y el
   pago en el panel del vendedor de prueba.

## 8. Checklist productivo

- [ ] `/api/mp/config-publica` → `env: production`.
- [ ] Access Token `APP_USR-...` (no `TEST-...`).
- [ ] Webhook configurado en MP y accesible (`curl -X POST` → 200).
- [ ] Compra real mínima: `preferenceId`, `paymentId` persisten; orden `paid` una vez; stock una vez.
- [ ] Webhook duplicado no duplica (`applied: 0`).
- [ ] `reconciliar` coincide con el panel MP.
- [ ] Logs `[mp]` sin tokens, secrets ni tarjetas.
