// Mercado Pago — capa SERVIDOR. Importar SOLO desde API routes (nunca desde componentes).
// Aquí viven: Access Token, firma HMAC de webhooks y llamadas a la API de MP.
//
// Env (server, NO exponer al navegador):
//   MP_ENV=sandbox|production (explícito; debe coincidir con el tipo de token)
//   MP_ACCESS_TOKEN (TEST-... pruebas · APP_USR-... real; jamás al front)
//   MP_WEBHOOK_SECRET (Tus integraciones → Webhooks → Configurar notificación)
//   MP_APP_URL (base pública del sitio, https en producción)
import crypto from "crypto";
import {
  MP_API_BASE,
  MP_CURRENCY,
  construirItemsPreferencia,
  esTokenProduccionMp,
  normalizarEnvMp,
  resolverEnvMp,
} from "./mp.js";

function leerConfig() {
  const accessToken = process.env.MP_ACCESS_TOKEN || "";
  const webhookSecret = process.env.MP_WEBHOOK_SECRET || "";
  if (!accessToken) {
    const err = new Error("Falta MP_ACCESS_TOKEN en el servidor.");
    err.code = "MP_SIN_CREDENCIALES";
    throw err;
  }
  const explicito = normalizarEnvMp(process.env.MP_ENV || "");
  // TEST-... jamás cobra de verdad: prohibido en producción.
  if (explicito === "production" && !esTokenProduccionMp(accessToken)) {
    const err = new Error("En production se exige un Access Token real (APP_USR-...).");
    err.code = "MP_TOKEN_PRUEBA_EN_PRODUCCION";
    throw err;
  }
  // APP_USR-... cobra de verdad: prohibido con entorno sandbox (evita cobros
  // reales desde dev/staging por error de configuración).
  if (explicito === "sandbox" && esTokenProduccionMp(accessToken)) {
    const err = new Error("Access Token real (APP_USR-...) con MP_ENV=sandbox. Cambia a production o usa uno TEST-.");
    err.code = "MP_TOKEN_PROD_EN_SANDBOX";
    throw err;
  }
  const env = resolverEnvMp({ env: process.env.MP_ENV || "", accessToken });
  const esProd = env === "production";
  const appUrl = ((process.env.MP_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, ""));
  if (esProd) {
    if (!appUrl || !/^https:\/\//i.test(appUrl) || /localhost|127\.0\.0\.1|\.local$/i.test(appUrl)) {
      const err = new Error("En production MP_APP_URL debe ser https pública (sin localhost).");
      err.code = "MP_URL_BASE_INVALIDA";
      throw err;
    }
  }
  return { env, esProd, accessToken, webhookSecret, currency: MP_CURRENCY, appUrl };
}

export function getMpConfigServer() {
  return leerConfig();
}

export function getMpConfigPublica() {
  const cfg = leerConfig();
  // Solo datos NO sensibles (jamás accessToken ni webhookSecret).
  return { env: cfg.env, currency: cfg.currency };
}

// Llamadas a la API REST de MP con timeout y errores tipados (sin SDK externo).
async function mpFetch(path, { method = "GET", body } = {}) {
  const cfg = leerConfig();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  let res;
  try {
    res = await fetch(`${MP_API_BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    const err = new Error(`Mercado Pago no disponible: ${e?.name === "AbortError" ? "timeout" : e?.message || e}`);
    err.code = "MP_NO_DISPONIBLE";
    throw err;
  } finally {
    clearTimeout(t);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Mercado Pago respondió ${res.status}: ${data?.message || "error"}`);
    err.code = "MP_API_ERROR";
    err.status = res.status;
    err.detalle = data;
    throw err;
  }
  return data;
}

// Crea la preferencia Checkout Pro y devuelve { id, initPoint }.
// init_point = producción · sandbox_init_point = pruebas con usuarios de prueba.
export async function crearPreferencia({ items, payerEmail, reference, description }) {
  const cfg = leerConfig();
  const pref = await mpFetch("/checkout/preferences", {
    method: "POST",
    body: {
      items: construirItemsPreferencia(items),
      payer: { email: payerEmail },
      back_urls: {
        success: `${cfg.appUrl}/pago/resultado-mp?reference=${encodeURIComponent(reference)}`,
        failure: `${cfg.appUrl}/pago/resultado-mp?reference=${encodeURIComponent(reference)}`,
        pending: `${cfg.appUrl}/pago/resultado-mp?reference=${encodeURIComponent(reference)}`,
      },
      auto_return: "approved",
      notification_url: `${cfg.appUrl}/api/mp/webhook`,
      external_reference: reference,
      statement_descriptor: "VINO MOMPOX",
      description: String(description || `Vino Mompox · ${reference}`).slice(0, 255),
    },
  });
  const initPoint = cfg.esProd ? pref.init_point : pref.sandbox_init_point || pref.init_point;
  if (!pref.id || !initPoint) {
    const err = new Error("Mercado Pago no devolvió preferencia válida.");
    err.code = "MP_PREFERENCIA_INVALIDA";
    throw err;
  }
  return { preferenceId: pref.id, initPoint };
}

// Pago por id (lo usa el webhook para verificar contra la API, no confía en el aviso).
export async function obtenerPagoMp(paymentId) {
  return mpFetch(`/v1/payments/${encodeURIComponent(String(paymentId))}`);
}

// Búsqueda por external_reference (reconciliación; no cambia estados).
export async function buscarPagosPorReferencia(reference) {
  const data = await mpFetch(`/v1/payments/search?external_reference=${encodeURIComponent(reference)}&limit=10`);
  return Array.isArray(data?.results) ? data.results : [];
}

// Valida el header x-signature del webhook (HMAC-SHA256, doc oficial sin SDK):
// manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
export function validarFirmaWebhookMp({ xSignature, xRequestId, dataId }) {
  try {
    const secret = process.env.MP_WEBHOOK_SECRET || "";
    if (!secret || !xSignature || !xRequestId || !dataId) return false;
    const partes = Object.fromEntries(
      String(xSignature).split(",").map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i).trim(), (p.slice(i + 1) || "").trim()];
      })
    );
    const ts = partes.ts || "";
    const v1 = partes.v1 || "";
    if (!ts || !v1) return false;
    const manifest = `id:${String(dataId).toLowerCase()};request-id:${String(xRequestId)};ts:${ts};`;
    const esperado = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const a = Buffer.from(v1.toLowerCase());
    const b = Buffer.from(esperado.toLowerCase());
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Firestore privilegiado (Admin SDK) para actualizar órdenes y stock.
let adminApp = null;

export function adminDbMp() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || "";
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "";
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || "";
  if (!projectId || !clientEmail || !privateKey) {
    const err = new Error("Falta configuración del Admin SDK.");
    err.code = "ADMIN_SIN_CONFIG";
    throw err;
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  if (!adminApp) {
    const admin = require("firebase-admin");
    adminApp = admin.apps.length
      ? admin.getApp()
      : admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
  }
  const admin = require("firebase-admin");
  return { db: admin.firestore(), FieldValue: admin.firestore.FieldValue };
}

// Log seguro: jamás incluye accessToken, webhookSecret ni datos de tarjeta.
export function logMp(...args) {
  console.log("[mp]", ...args);
}
