// Mercado Pago Checkout Pro — constantes puras, mapeo de estados y firma de webhooks.
// Sin secretos aquí: el Access Token y el Webhook Secret viven SOLO en el servidor
// (ver src/lib/mp-server.js). Fuentes: mercadopago.com.co/developers —
// Checkout Pro, Credenciales, Webhooks (x-signature HMAC-SHA256).

export const MP_API_BASE = "https://api.mercadopago.com";

// Entornos explícitos. OJO: MP no tiene endpoint sandbox separado; el entorno
// lo determina el TIPO de credencial (TEST- = pruebas, APP_USR- = real) y
// MP_ENV debe coincidir con ella o el servidor falla rápido.
export const MP_ENVS = ["sandbox", "production"];

export const MP_CURRENCY = "COP";

// Estados internos de la orden de Mercado Pago.
export const MP_ESTADOS = ["pending", "paid", "rejected", "cancelled", "error", "refunded"];

// status de Payment API → estado interno.
// approved · rejected/cancelled · refunded/charged_back ·
// pending/in_process/in_mediation/authorized → pendiente · resto → error.
export function mapMpStatus(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "approved") return "paid";
  if (s === "rejected" || s === "cancelled") return "rejected";
  if (s === "refunded" || s === "charged_back") return "refunded";
  if (s === "pending" || s === "in_process" || s === "in_mediation" || s === "authorized") return "pending";
  return "error";
}

export const MP_ESTADO_META = {
  pending: { titulo: "Pago pendiente", emoji: "⏳", color: "#f0d48a" },
  paid: { titulo: "Pago aprobado", emoji: "✅", color: "#bfe6c4" },
  rejected: { titulo: "Pago rechazado", emoji: "❌", color: "#e5c9c4" },
  cancelled: { titulo: "Pago cancelado", emoji: "🚫", color: "#ddd6c7" },
  error: { titulo: "Error en el pago", emoji: "⚠️", color: "#e5c9c4" },
  refunded: { titulo: "Pago devuelto", emoji: "↩️", color: "#cfd8e3" },
};

// El Access Token de pruebas empieza por TEST-; el real por APP_USR-.
export function esTokenPruebaMp(token) {
  return String(token || "").startsWith("TEST-");
}

export function esTokenProduccionMp(token) {
  return String(token || "").startsWith("APP_USR-");
}

export function normalizarEnvMp(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "production" || s === "prod" || s === "live") return "production";
  if (s === "sandbox" || s === "test" || s === "pruebas") return "sandbox";
  return "";
}

// Resuelve el entorno efectivo. LANZA (código MP_ENV_CONFLICTO) si el entorno
// explícito contradice el tipo de token: nunca hay fallback silencioso.
export function resolverEnvMp({ env, accessToken } = {}) {
  const explicito = normalizarEnvMp(env);
  const t = String(accessToken || "");
  const porToken = esTokenPruebaMp(t) ? "sandbox" : esTokenProduccionMp(t) ? "production" : "";
  if (explicito) {
    if (porToken && porToken !== explicito) {
      const err = new Error(`MP_ENV=${explicito} contradice el tipo de Access Token.`);
      err.code = "MP_ENV_CONFLICTO";
      throw err;
    }
    return explicito;
  }
  return porToken || "sandbox";
}

// live_mode del webhook/pago → entorno que declara MP.
export function envDeNotificacionMp(liveMode) {
  const s = String(liveMode ?? "").trim().toLowerCase();
  if (s === "true") return "production";
  if (s === "false") return "sandbox";
  return "desconocido";
}

// Ítems de la preferencia desde líneas internas (montos enteros COP).
export function construirItemsPreferencia(items) {
  return (items || []).map((i) => ({
    title: String(i.name || "Vino").slice(0, 255),
    quantity: Number(i.qty) || 0,
    unit_price: Math.round(Number(i.unitPrice) || 0),
    currency_id: MP_CURRENCY,
  }));
}

// Referencia única de orden: VM-MP-<base36 time>-<6 aleatorios>
export function generarReferenciaMp() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
  return `VM-MP-${t}-${r}`;
}

export function esEmailValidoMp(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());
}
