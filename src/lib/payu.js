// PayU WebCheckout (Sandbox) — constantes puras y mapeo de estados.
// Sin secretos aquí: las credenciales viven SOLO en variables de entorno
// leídas del lado servidor (ver src/lib/payu-server.js).
// Fuentes: developers.payulatam.com — WebCheckout, URL de Confirmación,
// URL de Respuesta y Códigos de Respuesta.

export const PAYU_SANDBOX_GATEWAY = "https://sandbox.checkout.payulatam.com/ppp-web-gateway-payu/";
export const PAYU_PROD_GATEWAY = "https://checkout.payulatam.com/ppp-web-gateway-payu/";

// Entornos explícitos PayU LATAM. El servidor resuelve UNO SOLO por arranque
// (ver PAYU_LATAM_ENV en payu-server.js): jamás se mezclan sandbox y producción.
export const PAYU_LATAM_ENVS = ["sandbox", "production"];

// Credenciales OFICIALES de prueba de PayU (documentación pública).
// Solo sirven en Sandbox: ningún cobro real es posible con ellas.
export const PAYU_TEST_MERCHANT_ID = "508029";
export const PAYU_TEST_ACCOUNT_ID = "512321";
export const PAYU_TEST_API_KEY = "4Vj8eK4rloUd272L48hsrarnUA";

export const PAYU_CURRENCY = "COP";

// Estados internos de pago de la orden (req: pending, paid, rejected, cancelled, error)
export const PAYU_ESTADOS = ["pending", "paid", "rejected", "cancelled", "error"];

// state_pol (webhook/confirmación) → estado interno.
// 4 aprobada · 6 rechazada/declinada · 5 expirada · 7/12/14 pendiente · 104 error.
export function mapStatePol(statePol) {
  const s = String(statePol ?? "").trim();
  if (s === "4") return "paid";
  if (s === "6") return "rejected";
  if (s === "5") return "cancelled"; // expirada → se trata como cancelada
  if (s === "7" || s === "12" || s === "14") return "pending";
  if (s === "104") return "error";
  return "error";
}

// transactionState (URL de respuesta, GET) → estado interno (SOLO display).
export function mapTransactionState(transactionState) {
  const s = String(transactionState ?? "").trim().toUpperCase();
  if (s === "4" || s === "APPROVED") return "paid";
  if (s === "6" || s === "DECLINED" || s === "REJECTED") return "rejected";
  if (s === "5" || s === "EXPIRED") return "cancelled";
  if (s === "7" || s === "PENDING" || s === "12" || s === "14") return "pending";
  return "error";
}

export const ESTADO_META = {
  pending: { titulo: "Pago pendiente", emoji: "⏳", color: "#f0d48a" },
  paid: { titulo: "Pago aprobado", emoji: "✅", color: "#bfe6c4" },
  rejected: { titulo: "Pago rechazado", emoji: "❌", color: "#e5c9c4" },
  cancelled: { titulo: "Pago cancelado", emoji: "🚫", color: "#ddd6c7" },
  error: { titulo: "Error en el pago", emoji: "⚠️", color: "#e5c9c4" },
};

// Monto para firma/request: COP no usa decimales (entero redondeado).
export function formatoMontoFirma(total) {
  return String(Math.round(Number(total) || 0));
}

// new_value del webhook: si el 2do decimal es 0 → 1 decimal, si no → 2.
// "45000.00" → "45000.0" · "150.25" → "150.25" (regla oficial PayU).
export function formatoValorWebhook(value) {
  const str = String(value ?? "").trim();
  const partes = str.split(".");
  if (partes.length === 1) return `${partes[0]}.0`;
  const ent = partes[0] || "0";
  const dec = (partes[1] || "").slice(0, 2).padEnd(2, "0");
  if (dec[1] === "0") return `${ent}.${dec[0]}`;
  return `${ent}.${dec}`;
}

// Redondeo "mitad al par" (banker's) a 1 decimal para validar la firma
// de la URL de respuesta. Math.round() NO sirve (es mitad hacia arriba).
export function roundHalfEven1(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  const ampliado = x * 10;
  const base = Math.trunc(ampliado);
  const resto = Math.abs(ampliado - base);
  let redondeado = base;
  if (resto > 0.5 + 1e-9) {
    redondeado = base + (ampliado >= 0 ? 1 : -1);
  } else if (Math.abs(resto - 0.5) <= 1e-9) {
    // Empate: quedarse con el par
    if (Math.abs(base) % 2 === 1) redondeado = base + (ampliado >= 0 ? 1 : -1);
  }
  return redondeado / 10;
}

// Formatea el TX_VALUE de la respuesta como PayU lo usa en la firma:
// número redondeado a 1 decimal (mitad al par), sin ceros de más.
export function formatoValorRespuesta(txValue) {
  const r = roundHalfEven1(txValue);
  if (!Number.isFinite(r)) return "";
  return String(r);
}

// Referencia única de orden: VM-<base36 time>-<6 aleatorios>
export function generarReferencia() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
  return `VM-${t}-${r}`;
}

export function esEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());
}

// ---------- Entorno LATAM (puro, testeable) ----------

// Normaliza valores comunes al vocabulario oficial: sandbox | production.
export function normalizarEnvPayu(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "production" || s === "prod" || s === "live") return "production";
  if (s === "sandbox" || s === "test" || s === "pruebas") return "sandbox";
  return "";
}

// Gateway oficial correspondiente al entorno. Fuente única de URLs:
// developers.payulatam.com — WebCheckout (sandbox vs producción).
export function gatewayPara(env) {
  if (env === "production") return PAYU_PROD_GATEWAY;
  return PAYU_SANDBOX_GATEWAY;
}

// Flag `test` del formulario WebCheckout: 1 = pruebas, 0 = producción real.
// developers.payulatam.com — "Pasar a producción utilizando WebCheckout".
export function testFlagPara(env) {
  return env === "production" ? "0" : "1";
}

// ¿Son las credenciales públicas de prueba de la documentación oficial?
// Solo sirven en sandbox: usarlas en producción es error de configuración.
export function esCredencialPrueba({ merchantId, accountId, apiKey }) {
  return (
    String(merchantId || "") === PAYU_TEST_MERCHANT_ID ||
    String(accountId || "") === PAYU_TEST_ACCOUNT_ID ||
    String(apiKey || "") === PAYU_TEST_API_KEY
  );
}

// Resuelve el entorno efectivo desde las tres señales posibles.
// LANZA (código PAYU_ENV_CONFLICTO) si se contradicen: nunca hay fallback
// silencioso entre sandbox y producción.
export function resolverEnvPayu({ env, test, gatewayUrl } = {}) {
  const explicito = normalizarEnvPayu(env);
  const porTest = test === "0" ? "production" : test === "1" ? "sandbox" : "";
  const gw = String(gatewayUrl || "").trim();
  const porGateway = gw === PAYU_PROD_GATEWAY ? "production" : gw === PAYU_SANDBOX_GATEWAY ? "sandbox" : "";
  if (explicito) {
    if (porTest && porTest !== explicito) {
      const err = new Error(`PAYU_LATAM_ENV=${explicito} contradice PAYU_TEST=${test}.`);
      err.code = "PAYU_ENV_CONFLICTO";
      throw err;
    }
    if (porGateway && porGateway !== explicito) {
      const err = new Error(`PAYU_LATAM_ENV=${explicito} contradice PAYU_GATEWAY_URL=${gw}.`);
      err.code = "PAYU_ENV_CONFLICTO";
      throw err;
    }
    return explicito;
  }
  if (porTest && porGateway && porTest !== porGateway) {
    const err = new Error(`PAYU_TEST=${test} contradice PAYU_GATEWAY_URL=${gw}.`);
    err.code = "PAYU_ENV_CONFLICTO";
    throw err;
  }
  return porTest || porGateway || "sandbox";
}

// Entorno que declara una notificación de PayU según su campo `test`.
// PayU envía test=1 (o true) en pruebas. Desconocido si no lo declara.
export function envDeNotificacion(testParam) {
  const s = String(testParam ?? "").trim().toLowerCase();
  if (s === "1" || s === "true") return "sandbox";
  if (s === "0" || s === "false") return "production";
  return "desconocido";
}
