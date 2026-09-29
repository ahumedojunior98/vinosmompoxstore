// Mercado Pago Checkout Pro — tests sin red (node --test).
// Webhook con Firestore se verifica manual (docs/mercadopago-checkout-pro.md §8).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  MP_API_BASE,
  MP_CURRENCY,
  mapMpStatus,
  MP_ESTADO_META,
  esTokenPruebaMp,
  esTokenProduccionMp,
  normalizarEnvMp,
  resolverEnvMp,
  envDeNotificacionMp,
  construirItemsPreferencia,
  generarReferenciaMp,
  esEmailValidoMp,
} from "../src/lib/mp.js";
import {
  validarFirmaWebhookMp,
  getMpConfigServer,
  getMpConfigPublica,
} from "../src/lib/mp-server.js";

const KEYS = ["MP_ENV", "MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET", "MP_APP_URL", "PAYU_APP_URL", "NEXT_PUBLIC_APP_URL"];

function conEnv(vars, fn) {
  const antes = {};
  for (const k of KEYS) antes[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of KEYS) delete process.env[k];
    for (const k of KEYS) if (antes[k] !== undefined) process.env[k] = antes[k];
  }
}

const TEST_CREDS = {
  MP_ACCESS_TOKEN: "TEST-1234567890123456-abcdef",
  MP_WEBHOOK_SECRET: "testsecret123",
  NEXT_PUBLIC_APP_URL: "http://localhost:3001",
};
const PROD_CREDS = {
  MP_ACCESS_TOKEN: "APP_USR-1234567890123456-abcdef",
  MP_WEBHOOK_SECRET: "prodsecret123",
  MP_APP_URL: "https://tienda.example.com",
};

describe("entorno sandbox/producción MP", () => {
  it("sandbox por defecto con token TEST-", () => {
    const cfg = conEnv({ ...TEST_CREDS, MP_ENV: "sandbox" }, () => getMpConfigPublica());
    assert.equal(cfg.env, "sandbox");
    assert.equal(cfg.currency, "COP");
  });
  it("production explícito con token APP_USR-", () => {
    const cfg = conEnv({ ...PROD_CREDS, MP_ENV: "production" }, () => getMpConfigPublica());
    assert.equal(cfg.env, "production");
  });
  it("entorno se infiere del token si no hay MP_ENV", () => {
    assert.equal(conEnv({ ...TEST_CREDS }, () => getMpConfigServer()).env, "sandbox");
    assert.equal(conEnv({ ...PROD_CREDS }, () => getMpConfigServer()).env, "production");
  });
  it("sin fallback silencioso: el resolver puro nunca mezcla", () => {
    const conflicto = (e) => e && e.code === "MP_ENV_CONFLICTO";
    assert.throws(() => resolverEnvMp({ env: "sandbox", accessToken: "APP_USR-x" }), conflicto);
    assert.throws(() => resolverEnvMp({ env: "production", accessToken: "TEST-x" }), conflicto);
  });
  it("token TEST- en production se rechaza", () => {
    assert.throws(
      () => conEnv({ MP_ACCESS_TOKEN: "TEST-x", MP_WEBHOOK_SECRET: "s", MP_ENV: "production", MP_APP_URL: "https://tienda.example.com" }, () => getMpConfigPublica()),
      (e) => e && e.code === "MP_TOKEN_PRUEBA_EN_PRODUCCION"
    );
  });
  it("token APP_USR- con sandbox se rechaza (evita cobros reales en dev)", () => {
    assert.throws(() => conEnv({ ...PROD_CREDS, MP_ENV: "sandbox" }, () => getMpConfigPublica()), (e) => e && e.code === "MP_TOKEN_PROD_EN_SANDBOX");
    // Sin MP_ENV, el token real infiere production y exige https.
    assert.throws(() => conEnv({ MP_ACCESS_TOKEN: "APP_USR-x", MP_WEBHOOK_SECRET: "s", NEXT_PUBLIC_APP_URL: "http://localhost:3001" }, () => getMpConfigPublica()), (e) => e && e.code === "MP_URL_BASE_INVALIDA");
  });
  it("production exige https pública", () => {
    assert.throws(
      () => conEnv({ ...PROD_CREDS, MP_ENV: "production", MP_APP_URL: "http://localhost:3001" }, () => getMpConfigPublica()),
      (e) => e && e.code === "MP_URL_BASE_INVALIDA"
    );
  });
  it("sin token falla rápido", () => {
    assert.throws(() => conEnv({}, () => getMpConfigPublica()), (e) => e && e.code === "MP_SIN_CREDENCIALES");
  });
  it("la config pública jamás expone secretos", () => {
    const cfg = conEnv({ ...TEST_CREDS, MP_ENV: "sandbox" }, () => getMpConfigPublica());
    const plano = JSON.stringify(cfg);
    assert.ok(!plano.includes("TEST-1234567890123456"));
    assert.ok(!plano.includes("testsecret123"));
  });
});

describe("firma HMAC del webhook", () => {
  it("firma válida se acepta; manipulada o incompleta se rechaza", () => {
    const secret = "clavewebhook123";
    const dataId = "987654321";
    const xRequestId = "req-abc-123";
    const ts = "1704908010";
    const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
    const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const base = { xRequestId, dataId };
    const bueno = conEnv({ ...TEST_CREDS, MP_WEBHOOK_SECRET: secret }, () =>
      validarFirmaWebhookMp({ ...base, xSignature: `ts=${ts},v1=${v1}` })
    );
    assert.equal(bueno, true);
    const malo = conEnv({ ...TEST_CREDS, MP_WEBHOOK_SECRET: secret }, () =>
      validarFirmaWebhookMp({ ...base, xSignature: `ts=${ts},v1=00` })
    );
    assert.equal(malo, false);
    const otroSecreto = conEnv({ ...TEST_CREDS, MP_WEBHOOK_SECRET: "otro" }, () =>
      validarFirmaWebhookMp({ ...base, xSignature: `ts=${ts},v1=${v1}` })
    );
    assert.equal(otroSecreto, false);
    const incompleto = conEnv({ ...TEST_CREDS, MP_WEBHOOK_SECRET: secret }, () =>
      validarFirmaWebhookMp({ xSignature: "", xRequestId, dataId })
    );
    assert.equal(incompleto, false);
  });
});

describe("estados y utilidades MP", () => {
  it("mapMpStatus oficial", () => {
    assert.equal(mapMpStatus("approved"), "paid");
    assert.equal(mapMpStatus("rejected"), "rejected");
    assert.equal(mapMpStatus("cancelled"), "rejected");
    assert.equal(mapMpStatus("refunded"), "refunded");
    assert.equal(mapMpStatus("charged_back"), "refunded");
    assert.equal(mapMpStatus("pending"), "pending");
    assert.equal(mapMpStatus("in_process"), "pending");
    assert.equal(mapMpStatus("in_mediation"), "pending");
    assert.equal(mapMpStatus("authorized"), "pending");
    assert.equal(mapMpStatus("raro"), "error");
  });
  it("meta cubre todos los estados", () => {
    for (const e of ["pending", "paid", "rejected", "cancelled", "error", "refunded"]) {
      assert.ok(MP_ESTADO_META[e]?.titulo, e);
    }
  });
  it("tokens por prefijo", () => {
    assert.equal(esTokenPruebaMp("TEST-abc"), true);
    assert.equal(esTokenPruebaMp("APP_USR-abc"), false);
    assert.equal(esTokenProduccionMp("APP_USR-abc"), true);
    assert.equal(esTokenProduccionMp("TEST-abc"), false);
    assert.equal(normalizarEnvMp("PROD"), "production");
    assert.equal(normalizarEnvMp("test"), "sandbox");
    assert.equal(resolverEnvMp({}), "sandbox");
  });
  it("envDeNotificacionMp por live_mode", () => {
    assert.equal(envDeNotificacionMp(true), "production");
    assert.equal(envDeNotificacionMp(false), "sandbox");
    assert.equal(envDeNotificacionMp("true"), "production");
    assert.equal(envDeNotificacionMp(undefined), "desconocido");
  });
  it("ítems de preferencia en COP enteros", () => {
    const items = construirItemsPreferencia([{ name: "Vino Corozo", qty: 2, unitPrice: 45000.7 }]);
    assert.deepEqual(items, [{ title: "Vino Corozo", quantity: 2, unit_price: 45001, currency_id: "COP" }]);
  });
  it("referencias MP únicas con formato", () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const r = generarReferenciaMp();
      assert.match(r, /^VM-MP-[A-Z0-9]+-[A-Z0-9]{6}$/);
      seen.add(r);
    }
    assert.equal(seen.size, 200);
    assert.equal(esEmailValidoMp("a@b.co"), true);
    assert.equal(esEmailValidoMp("nope"), false);
  });
  it("API base oficial y moneda COP", () => {
    assert.equal(MP_API_BASE, "https://api.mercadopago.com");
    assert.equal(MP_CURRENCY, "COP");
  });
});
