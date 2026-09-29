import { NextResponse } from "next/server";
import { validarFirmaRespuesta } from "@/lib/payu-server";

export const runtime = "nodejs";

// POST /api/payu/validar-respuesta
// Verifica la firma que PayU devuelve en la URL de retorno (GET).
// SOLO para mostrar "datos verificados" en pantalla: jamás cambia estados.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "cuerpo_invalido" }, { status: 400 });
  }
  const { merchantId, referenceCode, txValue, currency, transactionState, signature } = body || {};
  if (!referenceCode || !signature) {
    return NextResponse.json({ ok: true, firmaValida: false });
  }
  try {
    const firmaValida = validarFirmaRespuesta({ merchantId, referenceCode, txValue, currency, transactionState, signature });
    return NextResponse.json({ ok: true, firmaValida });
  } catch {
    return NextResponse.json({ ok: true, firmaValida: false });
  }
}
