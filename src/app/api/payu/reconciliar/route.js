import { NextResponse } from "next/server";
import { adminDb, logPayu } from "@/lib/payu-server";

export const runtime = "nodejs";

const REF_OK = /^[A-Z0-9-]{4,40}$/;
// Órdenes pending más viejas que esto se consideran "estancadas".
const STALE_MS = 30 * 60 * 1000;

// GET /api/payu/reconciliar?reference=VM-XXX — SOLO LECTURA.
// No aprueba, no cambia estados, no llama a PayU. Devuelve el estado local
// más la guía para conciliar contra el panel PayU (Módulo PayU → Reportes).
// La verdad de pago la establece SIEMPRE el webhook de confirmación.
export async function GET(req) {
  const reference = String(new URL(req.url).searchParams.get("reference") || "").trim().toUpperCase();
  if (!REF_OK.test(reference)) {
    return NextResponse.json({ ok: false, error: "referencia_invalida" }, { status: 400 });
  }

  let admin;
  try {
    admin = adminDb();
  } catch (e) {
    if (e.code === "ADMIN_SIN_CONFIG") {
      return NextResponse.json({ ok: false, error: "admin_sin_config" }, { status: 503 });
    }
    throw e;
  }

  try {
    const snap = await admin.db.collection("orders").where("referenciaPayU", "==", reference).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ ok: false, error: "orden_inexistente" }, { status: 404 });
    }
    const o = snap.docs[0].data() || {};
    const history = Array.isArray(o.payu?.history) ? o.payu.history : [];
    const creado = o.createdAt?.toDate ? o.createdAt.toDate().getTime() : null;
    const estancada = (o.paymentState || "pending") === "pending" && creado !== null && Date.now() - creado > STALE_MS;
    logPayu(`reconciliar ref=${reference} estado=${o.paymentState || "pending"}`);
    return NextResponse.json({
      ok: true,
      reference,
      paymentState: o.paymentState || "pending",
      env: o.payu?.env || null,
      total: Number(o.total) || 0,
      currency: o.payu?.currency || "COP",
      payu: {
        transactionId: o.payu?.transactionId || null,
        referencePol: o.payu?.referencePol || null,
        responseCode: o.payu?.responseCode || null,
        responseMessage: o.payu?.responseMessage || null,
        paymentMethod: o.payu?.paymentMethod || null,
        intentos: Array.isArray(o.payu?.processedTransactions) ? o.payu.processedTransactions.length : 0,
      },
      creado: creado ? new Date(creado).toISOString() : null,
      estancada,
      historial: history.slice(-5).map((h) => ({
        at: h.at || null,
        from: h.from ?? null,
        to: h.to ?? null,
        statePol: h.statePol ?? null,
        transactionId: h.transactionId ?? null,
      })),
      guia: estancada
        ? "Orden pending estancada: 1) Busca la referencia en el Módulo PayU → Reportes. 2) Si PayU la muestra APROBADA y el webhook nunca llegó, revisa los logs [payu] y el firewall/whitelist de IPs PayU, luego espera el reintento o contacta soporte PayU con reference_sale y transaction_id. 3) NUNCA marques paid a mano: deja que el webhook lo confirme."
        : "Si el estado es pending reciente, espera el webhook (PayU reintenta solo). Si es final, ya está conciliado.",
    });
  } catch (e) {
    logPayu(`reconciliar ref=${reference}: error`, e?.message || e);
    return NextResponse.json({ ok: false, error: "error_transitorio" }, { status: 500 });
  }
}
