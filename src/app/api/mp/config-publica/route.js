import { NextResponse } from "next/server";
import { getMpConfigPublica } from "@/lib/mp-server";

export const runtime = "nodejs";

// GET /api/mp/config-publica — entorno MP efectivo SIN secretos.
// El front lo usa solo para rótulos ("prueba" vs "real").
export async function GET() {
  try {
    const cfg = getMpConfigPublica();
    return NextResponse.json({ ok: true, ...cfg }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.code || "sin_config" }, { status: 500 });
  }
}
