import { NextResponse } from "next/server";
import { getPayuConfigPublica } from "@/lib/payu-server";

export const runtime = "nodejs";

// GET /api/payu/config-publica — entorno PayU efectivo SIN secretos.
// El front lo usa solo para rótulos ("prueba" vs "real"). Jamás incluye apiKey.
export async function GET() {
  try {
    const cfg = getPayuConfigPublica();
    return NextResponse.json({ ok: true, ...cfg }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.code || "sin_config" }, { status: 500 });
  }
}
