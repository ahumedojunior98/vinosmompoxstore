import { NextResponse } from "next/server";
import { adminDb, logPayu } from "@/lib/payu-server";

export const runtime = "nodejs";

const REF_OK = /^[A-Z0-9-]{4,40}$/;

// GET /api/payu/estado?reference=VM-XXX
// Devuelve el estado REAL de la orden desde Firestore (fuente de verdad).
// La página de resultado lo consulta por polling: jamás se confía en los
// parámetros GET que PayU devuelve al navegador.
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
      return NextResponse.json(
        { ok: false, error: "admin_sin_config", detalle: "Falta configurar el Admin SDK en el servidor." },
        { status: 503 }
      );
    }
    throw e;
  }

  try {
    const snap = await admin.db.collection("orders").where("referenciaPayU", "==", reference).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ ok: false, error: "orden_inexistente" }, { status: 404 });
    }
    const o = snap.docs[0].data() || {};
    return NextResponse.json({
      ok: true,
      reference,
      paymentState: o.paymentState || "pending",
      total: Number(o.total) || 0,
      currency: o.payu?.currency || "COP",
      env: o.payu?.env || null,
      botellas: (o.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0),
      creado: o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : null,
      payu: {
        transactionId: o.payu?.transactionId || null,
        responseMessage: o.payu?.responseMessage || null,
        paymentMethod: o.payu?.paymentMethod || null,
      },
    });
  } catch (e) {
    logPayu(`estado ref=${reference}: error`, e?.message || e);
    return NextResponse.json({ ok: false, error: "error_transitorio" }, { status: 500 });
  }
}
