import { NextResponse } from "next/server";
import { mapMpStatus } from "@/lib/mp";
import { buscarPagosPorReferencia, adminDbMp, logMp } from "@/lib/mp-server";

export const runtime = "nodejs";

const REF_OK = /^[A-Z0-9-]{4,40}$/;
const STALE_MS = 30 * 60 * 1000;

// GET /api/mp/reconciliar?reference=VM-MP-XXX — SOLO LECTURA.
// Consulta el estado local Y el estado autoritativo en la API de MP
// (búsqueda por external_reference). NUNCA escribe ni aprueba: si hay
// divergencia, el operador la resuelve (el webhook es quien confirma).
export async function GET(req) {
  const reference = String(new URL(req.url).searchParams.get("reference") || "").trim().toUpperCase();
  if (!REF_OK.test(reference)) {
    return NextResponse.json({ ok: false, error: "referencia_invalida" }, { status: 400 });
  }

  let admin;
  try {
    admin = adminDbMp();
  } catch (e) {
    if (e.code === "ADMIN_SIN_CONFIG") {
      return NextResponse.json({ ok: false, error: "admin_sin_config" }, { status: 503 });
    }
    throw e;
  }

  try {
    const snap = await admin.db.collection("orders").where("referenciaMP", "==", reference).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ ok: false, error: "orden_inexistente" }, { status: 404 });
    }
    const o = snap.docs[0].data() || {};
    const history = Array.isArray(o.mp?.history) ? o.mp.history : [];
    const creado = o.createdAt?.toDate ? o.createdAt.toDate().getTime() : null;
    const estadoLocal = o.paymentState || "pending";
    const estancada = estadoLocal === "pending" && creado !== null && Date.now() - creado > STALE_MS;

    // Verdad autoritativa en MP (solo lectura).
    let pagosMp = [];
    let mpError = null;
    try {
      const resultados = await buscarPagosPorReferencia(reference);
      pagosMp = resultados.map((p) => ({
        id: String(p.id),
        status: p.status || null,
        estadoMapeado: mapMpStatus(p.status),
        monto: Number(p.transaction_amount),
        moneda: p.currency_id || null,
        liveMode: p.live_mode ?? null,
      }));
    } catch (e) {
      mpError = e?.code || "mp_no_disponible";
    }

    const diverge =
      !mpError &&
      pagosMp.length > 0 &&
      pagosMp.some((p) => p.estadoMapeado === "paid" && estadoLocal !== "paid");
    logMp(`reconciliar ref=${reference} local=${estadoLocal} pagosMp=${pagosMp.length}${diverge ? " DIVERGE" : ""}`);
    return NextResponse.json({
      ok: true,
      reference,
      paymentState: estadoLocal,
      env: o.mp?.env || null,
      total: Number(o.total) || 0,
      currency: o.mp?.currency || "COP",
      estancada,
      diverge: !!diverge,
      pagosMp,
      mpError,
      historial: history.slice(-5).map((h) => ({
        at: h.at || null,
        from: h.from ?? null,
        to: h.to ?? null,
        estadoMp: h.estadoMp ?? null,
        paymentId: h.paymentId ?? null,
      })),
      guia: diverge
        ? "MP muestra un pago APROBADO que el webhook no registró: 1) Revisa los logs [mp] y que la notification_url de la preferencia apunte a https://TU-DOMINIO/api/mp/webhook. 2) MP reintenta solo; si no llega, contacta soporte MP con preference_id y payment_id. 3) NUNCA marques paid a mano."
        : "Estados conciliados o sin pagos en MP. Si es pending reciente, espera el webhook.",
    });
  } catch (e) {
    logMp(`reconciliar ref=${reference}: error`, e?.message || e);
    return NextResponse.json({ ok: false, error: "error_transitorio" }, { status: 500 });
  }
}
