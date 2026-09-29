// PayU LATAM — tests sin red (node --test). Capa pura + resolución de entorno.
// El webhook con Firestore se verifica manual (ver docs/payu-latam-produccion.md).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  PAYU_SANDBOX_GATEWAY,
  PAYU_PROD_GATEWAY,
  PAYU_CURRENCY,
  PAYU_TEST_MERCHANT_ID,
  PAYU_TEST_ACCOUNT_ID,
  PAYU_TEST_API_KEY,
  mapStatePol,
  mapTransactionState,
  formatoMontoFirma,
  formatoValorWebhook,
  formatoValorRespuesta,
  roundHalfEven1,
  generarReferencia,
  normalizarEnvPayu,
  gatewayPara,
  testFlagPara,
  esCredencialPrueba,
  resolverEnvPayu,
  envDeNotificacion,
} from "../src/lib/payu.js";
import {
  firmaCheckout,
  validarFirmaWebhook,
  validarFirmaRespuesta,
  getPayuConfigPublica,
} from "../src/lib/payu-server.js";

const KEYS = ["PAYU_LATAM_ENV", "PAYU_ENV", "PAYU_API_KEY", "PAYU_MERCHANT_ID", "PAYU_ACCOUNT_ID", "PAYU_TEST", "PAYU_GATEWAY_URL", "PAYU_APP_URL", "NEXT_PUBLIC_APP_URL"];

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
  PAYU_API_KEY: PAYU_TEST_API_KEY,
  PAYU_MERCHANT_ID: PAYU_TEST_MERCHANT_ID,
  PAYU_ACCOUNT_ID: PAYU_TEST_ACCOUNT_ID,
  NEXT_PUBLIC_APP_URL: "http://localhost:3001",
};
const PROD_CREDS = {
  PAYU_API_KEY: "k3yPr0dReal1234567890",
  PAYU_MERCHANT_ID: "123456",
  PAYU_ACCOUNT_ID: "654321",
  PAYU_APP_URL: "https://tienda.example.com",
};

describe("entorno sandbox/producción", () => {
  it("1. sandbox por defecto: gateway sandbox + test=1", () => {
    const cfg = conEnv(TEST_CREDS, () => getPayuConfigPublica());
    assert.equal(cfg.env, "sandbox");
    assert.equal(cfg.gatewayUrl, PAYU_SANDBOX_GATEWAY);
    assert.equal(cfg.test, "1");
  });
  it("2. production explícito: gateway prod + test=0", () => {
    const cfg = conEnv({ ...PROD_CREDS, PAYU_LATAM_ENV: "production" }, () => getPayuConfigPublica());
    assert.equal(cfg.env, "production");
    assert.equal(cfg.gatewayUrl, PAYU_PROD_GATEWAY);
    assert.equal(cfg.test, "0");
  });
  it("3. sin fallback silencioso: señales contradictorias lanzan", () => {
    const conflicto = (e) => e && e.code === "PAYU_ENV_CONFLICTO";
    assert.throws(() => conEnv({ ...PROD_CREDS, PAYU_LATAM_ENV: "production", PAYU_TEST: "1" }, () => getPayuConfigPublica()), conflicto);
    assert.throws(() => conEnv({ ...TEST_CREDS, PAYU_LATAM_ENV: "sandbox", PAYU_GATEWAY_URL: PAYU_PROD_GATEWAY }, () => getPayuConfigPublica()), conflicto);
    assert.throws(() => conEnv({ ...TEST_CREDS, PAYU_TEST: "0", PAYU_GATEWAY_URL: PAYU_SANDBOX_GATEWAY }, () => getPayuConfigPublica()), conflicto);
  });
  it("4. credencial de prueba en production se rechaza", () => {
    assert.throws(() => conEnv({ ...TEST_CREDS, PAYU_LATAM_ENV: "production", PAYU_APP_URL: "https://tienda.example.com" }, () => getPayuConfigPublica()), (e) => e && e.code === "PAYU_CREDENCIAL_PRUEBA_EN_PRODUCCION");
  });
  it("5. production exige https pública (no localhost, no vacío)", () => {
    const urlInvalida = (e) => e && e.code === "PAYU_URL_BASE_INVALIDA";
    assert.throws(() => conEnv({ ...PROD_CREDS, PAYU_LATAM_ENV: "production", PAYU_APP_URL: "http://localhost:3001" }, () => getPayuConfigPublica()), urlInvalida);
    const sinUrl = { ...PROD_CREDS };
    delete sinUrl.PAYU_APP_URL;
    assert.throws(() => conEnv({ ...sinUrl, PAYU_LATAM_ENV: "production" }, () => getPayuConfigPublica()), urlInvalida);
  });
  it("6. sin credenciales falla rápido", () => {
    assert.throws(() => conEnv({}, () => getPayuConfigPublica()), (e) => e && e.code === "PAYU_SIN_CREDENCIALES");
  });
  it("16. la config pública jamás expone apiKey", () => {
    const cfg = conEnv(TEST_CREDS, () => getPayuConfigPublica());
    assert.ok(!("apiKey" in cfg) && !("API_KEY" in cfg));
    assert.ok(!JSON.stringify(cfg).includes(PAYU_TEST_API_KEY));
  });
});

describe("firmas MD5 oficiales", () => {
  it("7. vector oficial WebCheckout: TestPayU/20000/COP", () => {
    // developers.payulatam.com — Formulario de Pago, ejemplo MD5.
    const { signature } = conEnv(TEST_CREDS, () => firmaCheckout({ referenceCode: "TestPayU", amount: 20000 }));
    assert.equal(signature, "7ee7cf808ce6a39b17481c54f2c57acc");
  });
  it("12. webhook válido se acepta; manipulado o merchant ajeno se rechaza", () => {
    const md5 = (s) => crypto.createHash("md5").update(s, "utf8").digest("hex");
    const sign = md5(`${PAYU_TEST_API_KEY}~508029~REF1~45000.0~COP~4`);
    const base = { merchantId: "508029", referenceSale: "REF1", value: "45000.00", currency: "COP", statePol: "4" };
    assert.equal(conEnv(TEST_CREDS, () => validarFirmaWebhook({ ...base, sign })), true);
    assert.equal(conEnv(TEST_CREDS, () => validarFirmaWebhook({ ...base, sign: "00" })), false);
    assert.equal(conEnv(TEST_CREDS, () => validarFirmaWebhook({ ...base, merchantId: "999999", sign })), false);
  });
  it("13. respuesta: firma válida acepta, manipulada rechaza", () => {
    const md5 = (s) => crypto.createHash("md5").update(s, "utf8").digest("hex");
    assert.equal(formatoValorRespuesta("45000.00"), "45000");
    const sign = md5(`${PAYU_TEST_API_KEY}~508029~REF1~45000~COP~APPROVED`);
    const base = { merchantId: "508029", referenceCode: "REF1", txValue: "45000.00", currency: "COP", transactionState: "APPROVED" };
    assert.equal(conEnv(TEST_CREDS, () => validarFirmaRespuesta({ ...base, signature: sign })), true);
    assert.equal(conEnv(TEST_CREDS, () => validarFirmaRespuesta({ ...base, signature: "00" })), false);
  });
});

describe("estados y formatos", () => {
  it("9. mapStatePol oficial", () => {
    assert.equal(mapStatePol("4"), "paid");
    assert.equal(mapStatePol("6"), "rejected");
    assert.equal(mapStatePol("5"), "cancelled");
    assert.equal(mapStatePol("7"), "pending");
    assert.equal(mapStatePol("12"), "pending");
    assert.equal(mapStatePol("14"), "pending");
    assert.equal(mapStatePol("104"), "error");
    assert.equal(mapStatePol("999"), "error");
  });
  it("10. mapTransactionState solo display", () => {
    assert.equal(mapTransactionState("APPROVED"), "paid");
    assert.equal(mapTransactionState("4"), "paid");
    assert.equal(mapTransactionState("DECLINED"), "rejected");
    assert.equal(mapTransactionState("PENDING"), "pending");
    assert.equal(mapTransactionState("EXPIRED"), "cancelled");
  });
  it("11. formatoValorWebhook oficial", () => {
    assert.equal(formatoValorWebhook("45000.00"), "45000.0");
    assert.equal(formatoValorWebhook("150.25"), "150.25");
    assert.equal(formatoValorWebhook("45000"), "45000.0");
  });
  it("banker rounding respuesta", () => {
    assert.equal(roundHalfEven1(2.25), 2.2);
    assert.equal(roundHalfEven1(2.35), 2.4);
    assert.equal(formatoValorRespuesta("45000.00"), "45000");
  });
  it("8. el servidor controla el monto (redondeo entero COP)", () => {
    assert.equal(formatoMontoFirma("45000.7"), "45001");
    assert.equal(formatoMontoFirma("abc"), "0");
  });
  it("referencias únicas con formato", () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const r = generarReferencia();
      assert.match(r, /^VM-[A-Z0-9]+-[A-Z0-9]{6}$/);
      seen.add(r);
    }
    assert.equal(seen.size, 200);
  });
});

describe("utilidades de entorno", () => {
  it("14. envDeNotificacion", () => {
    assert.equal(envDeNotificacion("1"), "sandbox");
    assert.equal(envDeNotificacion("true"), "sandbox");
    assert.equal(envDeNotificacion("0"), "production");
    assert.equal(envDeNotificacion("false"), "production");
    assert.equal(envDeNotificacion(""), "desconocido");
    assert.equal(envDeNotificacion(undefined), "desconocido");
  });
  it("15. normalizar/resolver/gateway/testFlag", () => {
    assert.equal(normalizarEnvPayu("PROD"), "production");
    assert.equal(normalizarEnvPayu("test"), "sandbox");
    assert.equal(normalizarEnvPayu(""), "");
    assert.equal(gatewayPara("production"), PAYU_PROD_GATEWAY);
    assert.equal(gatewayPara("sandbox"), PAYU_SANDBOX_GATEWAY);
    assert.equal(testFlagPara("production"), "0");
    assert.equal(testFlagPara("sandbox"), "1");
    assert.equal(resolverEnvPayu({}), "sandbox");
    assert.equal(resolverEnvPayu({ env: "production" }), "production");
    assert.throws(() => resolverEnvPayu({ env: "sandbox", test: "0" }), (e) => e && e.code === "PAYU_ENV_CONFLICTO");
  });
  it("credenciales de prueba se detectan", () => {
    assert.equal(esCredencialPrueba({ merchantId: "508029", accountId: "x", apiKey: "y" }), true);
    assert.equal(esCredencialPrueba({ merchantId: "1", accountId: "2", apiKey: "k3yPr0dReal1234567890" }), false);
  });
  it("17. separación LATAM: solo payulatam, moneda COP", () => {
    assert.equal(PAYU_CURRENCY, "COP");
    for (const u of [PAYU_SANDBOX_GATEWAY, PAYU_PROD_GATEWAY]) {
      assert.match(u, /^https:\/\/(sandbox\.)?checkout\.payulatam\.com\//);
      assert.ok(!u.includes("api.payu.com"));
    }
  });
});
