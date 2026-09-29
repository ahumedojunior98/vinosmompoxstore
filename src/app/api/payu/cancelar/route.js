import { NextResponse } from "next/server";
import { adminDb, logPayu } from "@/lib/payu-server";

export const runtime = "nodejs";

const REF_OK = /^[A-Z0-9-]{4,40}$/;

// POST /api/payu/cancelar { reference }
// Marca como cancelada una orden que sigue pendiente (usuario que abandonó el checkout).
// Solo permite pending → cancelled; nunca toca paid/rejected/error.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "cuerpo_invalido" }, { status: 400 });
  }
  const reference = String(body.reference || "").trim().toUpperCase();
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
    const resultado = await admin.db.runTransaction(async (tx) => {
      const snap = await tx.get(admin.db.collection("orders").where("referenciaPayU", "==", reference).limit(1));
      if (snap.empty) return { ok: false, error: "orden_inexistente" };
      const ref = snap.docs[0].ref;
      const o = snap.docs[0].data() || {};
      const actual = o.paymentState || "pending";
      if (actual !== "pending") return { ok: true, paymentState: actual, applied: false };
      tx.update(ref, {
        paymentState: "cancelled",
        "payu.history": admin.FieldValue.arrayUnion({
          at: new Date().toISOString(),
          from: "pending",
          to: "cancelled",
          detalle: "Cancelada por el comprador (abandonó el checkout)",
        }),
        updatedAt: admin.FieldValue.serverTimestamp(),
      });
      return { ok: true, paymentState: "cancelled", applied: true };
    });
    if (!resultado.ok) {
      return NextResponse.json(resultado, { status: 404 });
    }
    logPayu(`orden ${reference} cancelada por el comprador`);
    return NextResponse.json({ ok: true, reference, ...resultado });
  } catch (e) {
    logPayu(`cancelar ref=${reference}: error`, e?.message || e);
    return NextResponse.json({ ok: false, error: "error_transitorio" }, { status: 500 });
  }
}
