# PayU LATAM — arquitectura, producción y operación

Tienda: Next.js 16 (App Router) + Firestore. Integración **PayU WebCheckout**
(formulario POST firmado con MD5, `test` 1/0), moneda **COP**. Fuentes oficiales:
`developers.payulatam.com` — Formulario de Pago, URL de Confirmación,
URL de Respuesta, Desplegar a Producción.

> No existe integración europea en este repositorio (verificado por búsqueda:
> solo hay URLs `*.payulatam.com`). Si se añade una, debe vivir en módulo y
> credenciales separados; el test `17. separación LATAM` lo protege.

## 1. Flujo

```
Cliente (page.js) → POST /api/payu/crear-orden → orden `pending` en Firestore
  (total calculado en servidor desde `products`, referencia VM-única)
→ form auto-POST al gateway PayU → cliente paga
→ PayU POST /api/payu/confirmacion (webhook, única fuente de verdad)
→ /pago/resultado consulta GET /api/payu/estado por polling (nunca la URL)
```

## 2. Variables (`.env.example` tiene los nombres; valores reales solo en el deploy)

| Variable | Efecto |
|---|---|
| `PAYU_LATAM_ENV=sandbox\|production` | Entorno explícito. Gana sobre el legado. |
| `PAYU_API_KEY / PAYU_MERCHANT_ID / PAYU_ACCOUNT_ID` | Solo servidor. En prod se rechazan las credenciales oficiales de prueba. |
| `PAYU_TEST` (legado) | Debe coincidir (`1`=sandbox, `0`=prod) o el arranque falla. |
| `PAYU_GATEWAY_URL` (opcional) | Debe coincidir o el arranque falla. Vacío → oficial según entorno. |
| `PAYU_APP_URL` (+ fallback `NEXT_PUBLIC_APP_URL`) | Base pública. En prod exige `https` sin localhost (webhook/retorno). |
| `FIREBASE_ADMIN_*` | Solo servidor (webhook escribe con Admin SDK). |
| `NEXT_PUBLIC_ADMIN_EMAILS` | Roles, igual que el dashboard. |

Sandbox oficial: `https://sandbox.checkout.payulatam.com/ppp-web-gateway-payu/`
Producción oficial: `https://checkout.payulatam.com/ppp-web-gateway-payu/`
Centralizados en `src/lib/payu.js` (`gatewayPara`); ninguna ruta los hardcodea.

## 3. Webhook `/api/payu/confirmacion` (POST, 200 siempre salvo 5xx transitorio)

1. Parsea `x-www-form-urlencoded` (y JSON por compatibilidad).
2. Valida firma MD5 `apiKey~merchant_id~reference_sale~new_value~currency~state_pol`
   con regla oficial de `value` (`150.00`→`150.0`, `150.25`→`150.25`).
3. Rechaza sin tocar nada: firma inválida, sin referencia, orden inexistente.
4. **Entorno cruzado jamás aprueba**: `test` de la notificación vs `payu.env`
   de la orden vs `PAYU_LATAM_ENV` del servidor (`entorno_no_coincide`,
   `servidor_entorno_distinto`, `merchant_no_coincide`).
5. Transición atómica en Firestore: dedup por `transaction_id`
   (`payu.processedTransactions`), terminal `paid` nunca se degrada,
   monto (±0.5 COP) y moneda deben coincidir, stock se descuenta una vez
   (`payu.stockDescontado`), historial de auditoría en `payu.history`.
   Reintento de PayU = mismo `reference_sale`, nuevo `transaction_id`:
   se conserva cada intento.

Estados `state_pol` → interno: `4`→paid, `6`→rejected, `5`→cancelled,
`7/12/14`→pending, `104`/otro→error. `paid` solo lo escribe el webhook.

## 4. Respuesta `/pago/resultado` — no es autoridad

Muestra el estado de `/api/payu/estado`; la firma de la URL solo se valida
para el rótulo "URL verificada". Si el webhook no llegó, muestra pendiente
y sigue haciendo polling. `POST /api/payu/cancelar` solo permite
`pending → cancelled`.

## 5. Reconciliación (solo lectura, nunca auto-aprueba)

`GET /api/payu/reconciliar?reference=VM-…` devuelve estado local, último
historial y si está estancada (`pending` > 30 min) con guía: buscar la
referencia en Módulo PayU → Reportes; si PayU la muestra aprobada y el
webhook no llegó, revisar logs `[payu]`, whitelist de IPs PayU y esperar el
reintento. Nunca marcar `paid` a mano.

## 6. Despliegue a producción

1. En PayU: obtener ApiKey/MerchantId/AccountId reales; configurar en el
   Módulo PayU la **URL de respuesta** `https://TU-DOMINIO/pago/resultado`
   y la **URL de confirmación** `https://TU-DOMINIO/api/payu/confirmacion`
   (HTTPS con certificado válido, pública, sin auth).
2. En el hosting (Vercel/hosting actual): `PAYU_LATAM_ENV=production`,
   credenciales reales, `PAYU_APP_URL=https://TU-DOMINIO`,
   `FIREBASE_ADMIN_*`, resto de `.env.example`. Sin `.env` en git
   (`.gitignore` ya excluye `.env*`).
3. Si hay firewall: whitelist IPs PayU prod `34.233.144.154`,
   `184.73.94.138`, `52.73.124.136` (sandbox: `54.158.171.129`).
4. Verificar checklist §8, luego primera transacción real controlada (§9).

Rollback: volver `PAYU_LATAM_ENV=sandbox` + credenciales de prueba restaura
pruebas; las órdenes `paid` existentes no se tocan (terminal).

## 7. Reembolsos

PayU WebCheckout no expone reembolso automático en este proyecto: se hacen
desde el Módulo PayU y se anotan en `payu.history` de la orden. No hay
almacenamiento de tarjetas (WebCheckout redirige; PCI fuera de alcance del
código: no se guarda ni loguea PAN/CVV).

## 8. Checklist de verificación productiva

- [ ] `/api/payu/config-publica` → `env: production`, gateway oficial prod.
- [ ] MerchantId/AccountId = los del Módulo PayU (no `508029`/`512321`).
- [ ] Respuesta y confirmación configuradas en PayU con HTTPS del dominio.
- [ ] Webhook accesible desde internet (probar con `curl -X POST` → 200 con `sin_referencia`).
- [ ] Transacción real de monto bajo: `reference`, `transaction_id` y
      `reference_pol` persisten; orden pasa a `paid` una vez; stock descuenta una vez.
- [ ] Reenvío duplicado del webhook no duplica efectos (`applied: 0`).
- [ ] `GET /api/payu/reconciliar?reference=` refleja lo mismo que el panel PayU.
- [ ] Logs `[payu]` sin apiKey, firmas, tarjetas ni private keys.

## 9. Primera transacción real controlada

1. Deploy con §6 completo. 2. Compra mínima con tarjeta real del operador.
3. Confirma `paid` en `/pago/resultado` y en Firestore (`payu.transactionId`).
4. Confirma en Módulo PayU el mismo `reference_sale`/`transaction_id`.
5. Si queda `pending` > 10 min: `reconciliar` + panel PayU (§5).
6. Anula/devuelve desde el Módulo PayU si fue solo prueba.
