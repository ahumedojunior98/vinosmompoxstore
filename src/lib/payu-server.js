// PayU — capa SERVIDOR. Importar SOLO desde API routes (nunca desde componentes).
// Aquí viven: credenciales, firma MD5, validaciones y acceso privilegiado a Firestore.
//
// Env (server, NO exponer al navegador):
//   PAYU_LATAM_ENV=sandbox|production (explícito; gana sobre el legado)
//   PAYU_API_KEY, PAYU_MERCHANT_ID, PAYU_ACCOUNT_ID,
//   PAYU_TEST=1|0 (legado, debe coincidir con el entorno),
//   PAYU_GATEWAY_URL (opcional; si se define debe coincidir con el entorno),
//   PAYU_APP_URL (base pública del sitio, https en producción),
//   FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY
import crypto from "crypto";
import {
  PAYU_CURRENCY,
  formatoMontoFirma,
  formatoValorWebhook,
  formatoValorRespuesta,
  resolverEnvPayu,
  gatewayPara,
  testFlagPara,
  esCredencialPrueba,
} from "./payu.js";

function leerConfig() {
  const apiKey = process.env.PAYU_API_KEY || "";
  const merchantId = process.env.PAYU_MERCHANT_ID || "";
  const accountId = process.env.PAYU_ACCOUNT_ID || "";
  if (!apiKey || !merchantId || !accountId) {
    const err = new Error("Faltan credenciales PayU en el servidor (PAYU_API_KEY, PAYU_MERCHANT_ID, PAYU_ACCOUNT_ID).");
    err.code = "PAYU_SIN_CREDENCIALES";
    throw err;
  }
  // Entorno explícito: falla rápido si hay mezcla sandbox/producción.
  const env = resolverEnvPayu({
    env: process.env.PAYU_LATAM_ENV || process.env.PAYU_ENV || "",
    test: process.env.PAYU_TEST,
    gatewayUrl: process.env.PAYU_GATEWAY_URL,
  });
  const esProd = env === "production";
  // Las credenciales oficiales de prueba NUNCA cobran de verdad: prohibidas en prod.
  if (esProd && esCredencialPrueba({ merchantId, accountId, apiKey })) {
    const err = new Error("Credenciales de prueba de PayU configuradas con entorno production. Inyecta las reales.");
    err.code = "PAYU_CREDENCIAL_PRUEBA_EN_PRODUCCION";
    throw err;
  }
  // PAYU_APP_URL (server, en vivo) con fallback a la pública. No se usa solo
  // NEXT_PUBLIC_* porque Turbopack la incrusta al compilar y puede quedar vieja.
  const appUrl = ((process.env.PAYU_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, ""));
  if (esProd) {
    // El webhook y el retorno de PayU exigen URL pública con TLS válido.
    if (!appUrl || !/^https:\/\//i.test(appUrl) || /localhost|127\.0\.0\.1|\.local$/i.test(appUrl)) {
      const err = new Error("En production PAYU_APP_URL debe ser https pública (sin localhost).");
      err.code = "PAYU_URL_BASE_INVALIDA";
      throw err;
    }
  }
  return {
    env,
    esProd,
    apiKey,
    merchantId,
    accountId,
    currency: PAYU_CURRENCY,
    test: testFlagPara(env),
    gatewayUrl: process.env.PAYU_GATEWAY_URL || gatewayPara(env),
    appUrl,
  };
}

export function getPayuConfigPublica() {
  const cfg = leerConfig();
  // Solo datos NO sensibles para el front (jamás apiKey).
  return { env: cfg.env, merchantId: cfg.merchantId, accountId: cfg.accountId, currency: cfg.currency, test: cfg.test, gatewayUrl: cfg.gatewayUrl };
}

// Config COMPLETA solo-servidor (incluye appUrl para response/confirmation).
export function getPayuConfigServer() {
  return leerConfig();
}

export function md5(texto) {
  return crypto.createHash("md5").update(String(texto), "utf8").digest("hex");
}

// Firma del formulario WebCheckout: md5(ApiKey~merchantId~referenceCode~amount~currency)
export function firmaCheckout({ referenceCode, amount }) {
  const cfg = leerConfig();
  const monto = formatoMontoFirma(amount);
  return { signature: md5(`${cfg.apiKey}~${cfg.merchantId}~${referenceCode}~${monto}~${cfg.currency}`), monto, cfg };
}

function compararFirmas(recibida, calculada) {
  const a = String(recibida || "").toLowerCase();
  const b = String(calculada || "").toLowerCase();
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// Valida el `sign` del webhook con la REGLA OFICIAL de formato del valor.
// Acepta la variante sin ".0" (ej. "45000") porque deriva del mismo valor;
// un atacante sin el apiKey no puede forjar ninguna de las dos.
export function validarFirmaWebhook({ merchantId, referenceSale, value, currency, statePol, sign }) {
  const cfg = leerConfig();
  if (String(merchantId || "") !== String(cfg.merchantId)) return false;
  const oficial = formatoValorWebhook(value);
  const sinCero = oficial.endsWith(".0") ? oficial.slice(0, -2) : oficial;
  const candidatos = [oficial, sinCero].filter((v, i, arr) => arr.indexOf(v) === i);
  return candidatos.some((v) =>
    compararFirmas(sign, md5(`${cfg.apiKey}~${merchantId}~${referenceSale}~${v}~${currency}~${statePol}`))
  );
}

// Valida la `signature` de la URL de respuesta (SOLO para display, no para marcar pago).
export function validarFirmaRespuesta({ merchantId, referenceCode, txValue, currency, transactionState, signature }) {
  const cfg = leerConfig();
  if (String(merchantId || "") !== String(cfg.merchantId)) return false;
  const base = formatoValorRespuesta(txValue);
  if (base === "") return false;
  const conCero = base.includes(".") ? base : `${base}.0`;
  const candidatos = [base, conCero].filter((v, i, arr) => arr.indexOf(v) === i);
  return candidatos.some((v) =>
    compararFirmas(signature, md5(`${cfg.apiKey}~${merchantId}~${referenceCode}~${v}~${currency}~${transactionState}`))
  );
}

// ---------- Firestore privilegiado (Admin SDK) ----------
let adminApp = null;

export function adminDb() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || "";
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "";
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || "";
  if (!projectId || !clientEmail || !privateKey) {
    const err = new Error(
      "Falta configuración del Admin SDK (FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY). El webhook no puede actualizar órdenes."
    );
    err.code = "ADMIN_SIN_CONFIG";
    throw err;
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  if (!adminApp) {
    // require dinámico para no cargar firebase-admin en el edge ni en el cliente
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

// Log seguro: jamás incluye apiKey, firmas calculadas ni private keys.
export function logPayu(...args) {
  console.log("[payu]", ...args);
}
