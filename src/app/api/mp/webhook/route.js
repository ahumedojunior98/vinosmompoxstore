import { NextResponse } from "next/server";
import { mapMpStatus, envDeNotificacionMp } from "@/lib/mp";
import { validarFirmaWebhookMp, obtenerPagoMp, getMpConfigServer, adminDbMp, logMp } from "@/lib/mp-server";

export const runtime = "nodejs";

const ack = (payload) => NextResponse.json(payload, { status: 200 });

// POST /api/mp/webhook — webhook servidor-a-servidor de Mercado Pago.
// Es la ÚNICA fuente de verdad para marcar una orden como pagada.
// - Valida x-signature (HMAC-SHA256) antes de tocar nada.
// - NO confía en el aviso: verifica el pago contra la API de MP.
// - Idempotente: clave paymentId|status; paid terminal (salvo refunded informativo).
// - Siempre responde 200 (salvo falla transitoria 5xx para que MP reintente).
export async function POST(req) {
  const url = new URL(req.url);
  const tipo = url.searchParams.get("type") || url.searchParams.get("topic") || "";

  let body = {};
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) body = await req.json();
  } catch {
    return ack({ ok: false, error: "cuerpo_ilegible" });
  }

  // Solo procesamos pagos; el resto (merchant_order, etc.) se acusa sin procesar.
  if (tipo && tipo !== "payment") {
    return ack({ ok: false, error: "tipo_ignorado" });
  }

  const dataId = url.searchParams.get("data.id") || body?.data?.id || "";
  const liveMode = url.searchParams.get("live_mode") ?? body?.live_mode;
  if (!dataId) {
    logMp("webhook sin data.id, se ignora");
    return ack({ ok: false, error: "sin_data_id" });
  }

  // 1) Firma HMAC: si no valida, NO se procesa.
  let firmaOk = false;
  let cfgEnv = "";
  try {
    cfgEnv = getMpConfigServer().env;
    firmaOk = validarFirmaWebhookMp({
      xSignature: req.headers.get("x-signature") || "",
      xRequestId: req.headers.get("x-request-id") || "",
      dataId: String(dataId),
    });
  } catch (e) {
    if (String(e.code || "").startsWith("MP_")) {
      logMp("webhook sin configuración MP válida:", e.code);
      return NextResponse.json({ ok: false, error: "sin_config" }, { status: 500 });
    }
    throw e;
  }
  if (!firmaOk) {
    logMp(`webhook pago=${dataId}: firma inválida, se ignora`);
    return ack({ ok: false, error: "firma_invalida" });
  }

  // 2) Verdad contra la API de MP (nunca contra el aviso).
  let pago;
  try {
    pago = await obtenerPagoMp(dataId);
  } catch (e) {
    if (e.code === "MP_NO_DISPONIBLE") {
      logMp(`webhook pago=${dataId}: MP no disponible, reintentará`);
      return NextResponse.json({ ok: false, error: "error_transitorio" }, { status: 503 });
    }
    if (e.code === "MP_API_ERROR" && e.status === 404) {
      logMp(`webhook pago=${dataId}: pago inexistente en MP, se ignora`);
      return ack({ ok: false, error: "pago_inexistente" });
    }
    logMp(`webhook pago=${dataId}: error consultando MP`, e?.code || e?.message || e);
    return NextResponse.json({ ok: false, error: "error_transitorio" }, { status: 500 });
  }

  const reference = String(pago.external_reference || "");
  const estadoMp = String(pago.status || "");
  const montoMp = Number(pago.transaction_amount);
  const monedaMp = String(pago.currency_id || "");
  const notifEnv = envDeNotificacionMp(pago.live_mode ?? liveMode);
  if (!reference) {
    logMp(`webhook pago=${dataId}: sin external_reference, se ignora`);
    return ack({ ok: false, error: "sin_referencia" });
  }

  // 3) Privilegio servidor para actualizar (Admin SDK).
  let admin;
  try {
    admin = adminDbMp();
  } catch {
    logMp(`webhook ref=${reference}: Admin SDK sin configurar, MP reintentará`);
    return NextResponse.json({ ok: false, error: "admin_sin_config" }, { status: 503 });
  }
  const { db, FieldValue } = admin;

  const snap = await db.collection("orders").where("referenciaMP", "==", reference).limit(1).get();
  if (snap.empty) {
    logMp(`webhook ref=${reference}: orden inexistente, se ignora`);
    return ack({ ok: false, error: "orden_inexistente" });
  }
  const orderRef = snap.docs[0].ref;
  const ordenActual = snap.docs[0].data() || {};
  const ordenEnv = ordenActual.mp?.env || "";

  // Entorno cruzado jamás aprueba (sandbox ≠ production).
  if (ordenEnv && notifEnv !== "desconocido" && notifEnv !== ordenEnv) {
    logMp(`webhook ref=${reference}: entorno no coincide (orden=${ordenEnv}, notif=${notifEnv}), se ignora`);
    return ack({ ok: false, error: "entorno_no_coincide" });
  }
  if (ordenEnv && cfgEnv && cfgEnv !== ordenEnv) {
    logMp(`webhook ref=${reference}: servidor en ${cfgEnv} vs orden ${ordenEnv}, se ignora`);
    return ack({ ok: false, error: "servidor_entorno_distinto" });
  }

  // 4) Transición atómica e idempotente (clave pago|estado: el mismo pago
  // puede avisar pending y luego approved con el mismo id).
  const dedupKey = `${dataId}|${estadoMp}`;
  let resultado;
  try {
    resultado = await db.runTransaction(async (tx) => {
      const osnap = await tx.get(orderRef);
      if (!osnap.exists) return { applied: false, reason: "orden_inexistente" };
      const o = osnap.data() || {};
      const mp = o.mp || {};
      const procesados = Array.isArray(mp.processedPayments) ? mp.processedPayments : [];
      const estadoActual = o.paymentState || "pending";

      const evento = {
        at: new Date().toISOString(),
        from: estadoActual,
        estadoMp,
        paymentId: String(dataId),
      };

      if (dedupKey && procesados.includes(dedupKey)) {
        return { applied: false, reason: "duplicado", paymentState: estadoActual };
      }

      let nuevoEstado = mapMpStatus(estadoMp);

      // Orden ya pagada: terminal. Solo se admite el paso informativo a refunded
      // (no re-stockea: la devolución física se gestiona manual).
      if (estadoActual === "paid" && nuevoEstado !== "refunded") {
        tx.update(orderRef, {
          "mp.history": FieldValue.arrayUnion({ ...evento, to: "paid", detalle: "Notificación posterior ignorada (ya pagada)" }),
          ...(dedupKey ? { "mp.processedPayments": FieldValue.arrayUnion(dedupKey) } : {}),
          "mp.lastWebhookAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { applied: false, reason: "ya_pagada", paymentState: "paid" };
      }

      // Anti-manipulación: monto y moneda deben calzar con la orden.
      const totalOrden = Number(o.total) || 0;
      if (!Number.isFinite(montoMp) || Math.abs(montoMp - totalOrden) > 0.5) {
        tx.update(orderRef, {
          paymentState: "error",
          "mp.history": FieldValue.arrayUnion({ ...evento, to: "error", detalle: `Monto no coincide (orden=${totalOrden}, MP=${montoMp})` }),
          ...(dedupKey ? { "mp.processedPayments": FieldValue.arrayUnion(dedupKey) } : {}),
          "mp.lastWebhookAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { applied: true, paymentState: "error", reason: "monto_no_coincide" };
      }
      if (monedaMp && (mp.currency || "COP") && monedaMp !== (mp.currency || "COP")) {
        tx.update(orderRef, {
          paymentState: "error",
          "mp.history": FieldValue.arrayUnion({ ...evento, to: "error", detalle: `Moneda no coincide (${monedaMp})` }),
          ...(dedupKey ? { "mp.processedPayments": FieldValue.arrayUnion(dedupKey) } : {}),
          "mp.lastWebhookAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { applied: true, paymentState: "error", reason: "moneda_no_coincide" };
      }

      const parche = {
        paymentState: nuevoEstado,
        "mp.paymentId": String(dataId),
        "mp.paymentStatus": estadoMp,
        "mp.paymentMethod": pago.payment_method_id || pago.payment_type_id || mp.paymentMethod || null,
        "mp.merchantOrderId": pago.merchant_order_id ? String(pago.merchant_order_id) : mp.merchantOrderId || null,
        "mp.lastWebhookAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (dedupKey) parche["mp.processedPayments"] = FieldValue.arrayUnion(dedupKey);

      // Solo al pasar a paid por primera vez: stock + stats (idempotente).
      if (nuevoEstado === "paid" && mp.stockDescontado !== true) {
        for (const item of o.items || []) {
          if (item.descontarStock === false) continue;
          if (!item.productId || !(Number(item.qty) > 0)) continue;
          const psnap = await tx.get(db.collection("products").doc(item.productId));
          if (!psnap.exists) continue;
          tx.update(db.collection("products").doc(item.productId), {
            stock: FieldValue.increment(-Number(item.qty)),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        parche["mp.stockDescontado"] = true;
        if (o.uid) {
          tx.set(
            db.collection("users").doc(o.uid),
            {
              ordersCount: FieldValue.increment(1),
              totalGastado: FieldValue.increment(totalOrden),
              lastOrderAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      }

      parche["mp.history"] = FieldValue.arrayUnion({ ...evento, to: nuevoEstado });
      tx.update(orderRef, parche);
      return { applied: true, paymentState: nuevoEstado };
    });
  } catch (e) {
    logMp(`webhook ref=${reference}: error transacción`, e?.message || e);
    return NextResponse.json({ ok: false, error: "error_transitorio" }, { status: 500 });
  }

  logMp(
    `webhook ref=${reference} env=${ordenEnv || "?"} estadoMp=${estadoMp} pago=${dataId} → ${resultado.paymentState || "?"} applied=${resultado.applied ? 1 : 0}${resultado.reason ? ` (${resultado.reason})` : ""}`
  );
  return ack({ ok: true, reference, paymentState: resultado.paymentState, applied: !!resultado.applied, reason: resultado.reason || null });
}

export async function GET() {
  return NextResponse.json(
    { ok: true, servicio: "webhook Mercado Pago", metodo: "POST", nota: "Solo MP debe llamar este endpoint." },
    { status: 200 }
  );
}
