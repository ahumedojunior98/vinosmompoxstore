import { NextResponse } from "next/server";
import { mapStatePol, envDeNotificacion } from "@/lib/payu";
import { validarFirmaWebhook, getPayuConfigServer, adminDb, logPayu } from "@/lib/payu-server";

export const runtime = "nodejs";

const ack = (payload) => NextResponse.json(payload, { status: 200 });

// POST /api/payu/confirmacion — webhook servidor-a-servidor de PayU.
// Es la ÚNICA fuente de verdad para marcar una orden como pagada.
// - Valida la firma MD5 oficial antes de tocar nada.
// - Idempotente: notificaciones repetidas no duplican efectos.
// - Nunca degrada una orden ya pagada.
// - Siempre responde HTTP 200 (salvo falla transitoria 5xx para que PayU reintente).
export async function POST(req) {
  let data = {};
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = await req.json();
    } else {
      const form = await req.formData();
      form.forEach((v, k) => {
        data[k] = String(v);
      });
    }
  } catch {
    return ack({ ok: false, error: "cuerpo_ilegible" });
  }

  const merchantId = data.merchant_id || "";
  const reference = data.reference_sale || "";
  const value = data.value || "";
  const currency = data.currency || "";
  const statePol = String(data.state_pol ?? "");
  const sign = data.sign || "";
  const transactionId = data.transaction_id || "";
  const referencePol = data.reference_pol || "";
  const responseCode = data.response_code_pol || "";
  const responseMessage = data.response_message_pol || "";
  const paymentMethod = data.payment_method_name || data.payment_method || "";
  const esPrueba = String(data.test ?? "") === "1";

  // Sin referencia no hay nada que buscar: ack sin procesar (log sin secretos).
  if (!reference) {
    logPayu("webhook sin reference_sale, se ignora");
    return ack({ ok: false, error: "sin_referencia" });
  }

  // 1) Firma: si no valida, NO se procesa (posible spoofing o mala config).
  let firmaOk = false;
  let cfgEnv = "";
  try {
    firmaOk = validarFirmaWebhook({ merchantId, referenceSale: reference, value, currency, statePol, sign });
    cfgEnv = getPayuConfigServer().env;
  } catch (e) {
    if (e.code === "PAYU_SIN_CREDENCIALES" || e.code === "PAYU_ENV_CONFLICTO" || e.code === "PAYU_CREDENCIAL_PRUEBA_EN_PRODUCCION") {
      logPayu("webhook sin configuración PayU válida:", e.code);
      return NextResponse.json({ ok: false, error: "sin_config" }, { status: 500 });
    }
    throw e;
  }
  if (!firmaOk) {
    logPayu(`firma inválida ref=${reference} state_pol=${statePol} test=${esPrueba ? 1 : 0}`);
    return ack({ ok: false, error: "firma_invalida" });
  }

  // 2) Privilegio servidor para actualizar (Admin SDK).
  let admin;
  try {
    admin = adminDb();
  } catch (e) {
    logPayu(`webhook ref=${reference}: Admin SDK sin configurar, PayU reintentará`);
    return NextResponse.json({ ok: false, error: "admin_sin_config" }, { status: 503 });
  }
  const { db, FieldValue } = admin;

  // 3) Buscar la orden por referencia única.
  const snap = await db.collection("orders").where("referenciaPayU", "==", reference).limit(1).get();
  if (snap.empty) {
    logPayu(`webhook ref=${reference}: orden inexistente, se ignora`);
    return ack({ ok: false, error: "orden_inexistente" });
  }
  const orderRef = snap.docs[0].ref;
  const ordenActual = snap.docs[0].data() || {};
  const ordenEnv = ordenActual.payu?.env || "";
  const notifEnv = envDeNotificacion(data.test);

  // Entorno cruzado: una notificación sandbox jamás aprueba una orden
  // production y viceversa. Se responde 200 (ack) sin tocar la orden.
  // Órdenes legacy sin payu.env omiten este chequeo (no requieren migración).
  if (ordenEnv && notifEnv !== "desconocido" && notifEnv !== ordenEnv) {
    logPayu(`webhook ref=${reference}: entorno no coincide (orden=${ordenEnv}, notif=${notifEnv}), se ignora`);
    return ack({ ok: false, error: "entorno_no_coincide" });
  }
  if (ordenEnv && cfgEnv && cfgEnv !== ordenEnv) {
    logPayu(`webhook ref=${reference}: servidor en ${cfgEnv} vs orden ${ordenEnv}, se ignora`);
    return ack({ ok: false, error: "servidor_entorno_distinto" });
  }
  // La orden se creó bajo un merchant concreto: si el webhook trae otro,
  // no puede aprobarla (rotación de credenciales o spoofing parcial).
  if (ordenActual.payu?.merchantId && String(merchantId) !== String(ordenActual.payu.merchantId)) {
    logPayu(`webhook ref=${reference}: merchant no coincide con la orden, se ignora`);
    return ack({ ok: false, error: "merchant_no_coincide" });
  }

  // 4) Transición atómica e idempotente.
  const dedupKey = transactionId || `${referencePol}|${statePol}`;
  let resultado;
  try {
    resultado = await db.runTransaction(async (tx) => {
      const osnap = await tx.get(orderRef);
      if (!osnap.exists) return { applied: false, reason: "orden_inexistente" };
      const o = osnap.data() || {};
      const payu = o.payu || {};
      const procesados = Array.isArray(payu.processedTransactions) ? payu.processedTransactions : [];
      const estadoActual = o.paymentState || "pending";

      const evento = {
        at: new Date().toISOString(),
        from: estadoActual,
        statePol,
        responseCode: responseCode || null,
        transactionId: transactionId || null,
      };

      // Repetido exacto → ack sin tocar nada.
      if (dedupKey && procesados.includes(dedupKey)) {
        return { applied: false, reason: "duplicado", paymentState: estadoActual };
      }

      // Orden ya pagada: terminal. Se registra el evento pero jamás se degrada.
      if (estadoActual === "paid") {
        tx.update(orderRef, {
          "payu.history": FieldValue.arrayUnion({ ...evento, to: "paid", detalle: "Notificación posterior ignorada (ya pagada)" }),
          ...(dedupKey ? { "payu.processedTransactions": FieldValue.arrayUnion(dedupKey) } : {}),
          "payu.lastWebhookAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { applied: false, reason: "ya_pagada", paymentState: "paid" };
      }

      let nuevoEstado = mapStatePol(statePol);

      // Chequeo anti-manipulación: el valor notificado debe calzar con la orden.
      const valorNotificado = Number(String(value).replace(/,/g, "."));
      const totalOrden = Number(o.total) || 0;
      if (!Number.isFinite(valorNotificado) || Math.abs(valorNotificado - totalOrden) > 0.5) {
        tx.update(orderRef, {
          paymentState: "error",
          "payu.history": FieldValue.arrayUnion({
            ...evento, to: "error", detalle: `Monto no coincide (orden=${totalOrden}, notificado=${value})`,
          }),
          ...(dedupKey ? { "payu.processedTransactions": FieldValue.arrayUnion(dedupKey) } : {}),
          "payu.lastWebhookAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { applied: true, paymentState: "error", reason: "monto_no_coincide" };
      }

      // Moneda debe coincidir también.
      if (currency && o.payu?.currency && currency !== o.payu.currency) {
        tx.update(orderRef, {
          paymentState: "error",
          "payu.history": FieldValue.arrayUnion({ ...evento, to: "error", detalle: `Moneda no coincide (${currency})` }),
          ...(dedupKey ? { "payu.processedTransactions": FieldValue.arrayUnion(dedupKey) } : {}),
          "payu.lastWebhookAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { applied: true, paymentState: "error", reason: "moneda_no_coincide" };
      }

      const parche = {
        paymentState: nuevoEstado,
        "payu.transactionId": transactionId || payu.transactionId || null,
        "payu.referencePol": referencePol || payu.referencePol || null,
        "payu.responseCode": responseCode || null,
        "payu.responseMessage": responseMessage || null,
        "payu.paymentMethod": paymentMethod || payu.paymentMethod || null,
        "payu.lastWebhookAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (dedupKey) parche["payu.processedTransactions"] = FieldValue.arrayUnion(dedupKey);
      let notaStock = "";

      // Solo al pasar a paid por primera vez: descontar stock + stats usuario.
      if (nuevoEstado === "paid" && payu.stockDescontado !== true) {
        for (const item of o.items || []) {
          if (item.descontarStock === false) continue;
          if (!item.productId || !(Number(item.qty) > 0)) continue;
          // Si el producto fue borrado, se salta (queda en el historial) en vez
          // de reventar la transacción y provocar reintentos eternos de PayU.
          const psnap = await tx.get(db.collection("products").doc(item.productId));
          if (!psnap.exists) {
            notaStock += (notaStock ? " | " : "") + `Sin stock: ${item.name || item.productId} (producto borrado)`;
            continue;
          }
          tx.update(db.collection("products").doc(item.productId), {
            stock: FieldValue.increment(-Number(item.qty)),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        parche["payu.stockDescontado"] = true;
        if (o.uid) {
          // set+merge: funciona exista o no el doc (update fallaría si fue borrado).
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

      parche["payu.history"] = FieldValue.arrayUnion({
        ...evento,
        to: nuevoEstado,
        ...(notaStock ? { detalle: notaStock } : {}),
      });

      tx.update(orderRef, parche);
      return { applied: true, paymentState: nuevoEstado };
    });
  } catch (e) {
    logPayu(`webhook ref=${reference}: error transacción`, e?.message || e);
    return NextResponse.json({ ok: false, error: "error_transitorio" }, { status: 500 });
  }

  logPayu(
    `webhook ref=${reference} env=${ordenEnv || "?"} state_pol=${statePol} tx=${transactionId || "?"} → ${resultado.paymentState || "?"} applied=${resultado.applied ? 1 : 0}${resultado.reason ? ` (${resultado.reason})` : ""}`
  );
  return ack({ ok: true, reference, paymentState: resultado.paymentState, applied: !!resultado.applied, reason: resultado.reason || null });
}

// GET de cortesía: PayU solo usa POST; si alguien abre la URL en el navegador,
// se le dice cómo funciona sin exponer nada sensible.
export async function GET() {
  return NextResponse.json(
    { ok: true, servicio: "webhook PayU (URL de confirmación)", metodo: "POST", nota: "Solo PayU debe llamar este endpoint." },
    { status: 200 }
  );
}
