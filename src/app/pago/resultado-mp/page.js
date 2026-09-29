"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Wine, ShieldCheck, Loader2, ArrowLeft, RotateCcw, Ban } from "lucide-react";
import { formatCOP } from "@/lib/utils";
import { MP_ESTADO_META } from "@/lib/mp";
import { useSesion, guardarCarritoNube } from "@/lib/auth";

const FINAL = ["paid", "rejected", "cancelled", "error", "refunded"];

const MENSAJES = {
  paid: {
    titulo: "¡Pago aprobado! 🍷",
    texto: "Mercado Pago confirmó tu pago y tu pedido entró a la bodega. Te escribiremos por WhatsApp para coordinar la entrega.",
  },
  rejected: {
    titulo: "Pago rechazado",
    texto: "Mercado Pago o el banco rechazó la transacción. Tu canasta sigue intacta: puedes intentarlo con otro medio.",
  },
  pending: {
    titulo: "Pago pendiente ⏳",
    texto: "Tu pago aún no se confirma (p. ej. PSE o efectivo en proceso). Esta página se actualiza sola; también te avisaremos por WhatsApp.",
  },
  cancelled: {
    titulo: "Compra cancelada",
    texto: "Cancelaste el checkout o la transacción expiró. No se cobró nada y tu canasta sigue intacta.",
  },
  error: {
    titulo: "Algo falló con el pago",
    texto: "Hubo un error procesando la transacción. No se cobró nada. Escríbenos por WhatsApp y lo resolvemos.",
  },
  refunded: {
    titulo: "Pago devuelto",
    texto: "Este pago fue devuelto a tu medio original. Si tienes dudas, escríbenos por WhatsApp.",
  },
};

function Contenido() {
  const params = useSearchParams();
  const sesion = useSesion();
  const [refManual, setRefManual] = useState("");
  // Referencia inicial desde la URL (lazy init, sin efectos); el botón "Ver"
  // usa elegirReferencia para cambios posteriores.
  const [reference, setReferenceState] = useState(() =>
    String(params.get("reference") || "").trim().toUpperCase()
  );
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorApi, setErrorApi] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [msgCancel, setMsgCancel] = useState("");
  const intentos = useRef(0);
  const carritoLimpio = useRef(false);

  function elegirReferencia(ref) {
    const r = String(ref || "").trim().toUpperCase();
    if (!r) return;
    intentos.current = 0;
    setErrorApi("");
    setEstado(null);
    setCargando(true);
    setReferenceState(r);
  }

  const consultarEstado = useCallback(async (ref) => {
    const res = await fetch(`/api/mp/estado?reference=${encodeURIComponent(ref)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error === "orden_inexistente" ? "orden_inexistente" : data.error || `Error ${res.status}`);
    return data;
  }, []);

  useEffect(() => {
    if (!reference) return;
    let vivo = true;
    async function ronda() {
      try {
        const data = await consultarEstado(reference);
        if (!vivo) return;
        setEstado(data);
        setCargando(false);
        setErrorApi("");
        if (FINAL.includes(data.paymentState)) return;
      } catch (e) {
        if (!vivo) return;
        setCargando(false);
        setErrorApi(e.message === "orden_inexistente" ? "No existe una orden con esa referencia." : "No pude consultar el estado todavía. Reintentando…");
      }
      intentos.current += 1;
      if (vivo && intentos.current < 22) setTimeout(ronda, 4000);
    }
    ronda();
    return () => { vivo = false; };
  }, [reference, consultarEstado]);

  useEffect(() => {
    if (estado?.paymentState === "paid" && !carritoLimpio.current) {
      carritoLimpio.current = true;
      try { localStorage.removeItem("vino-mompox-cart"); } catch { /* nada */ }
      const uid = sesion?.fbUser?.uid;
      if (uid) guardarCarritoNube(uid, {});
    }
  }, [estado, sesion]);

  async function onCancelar() {
    if (!reference || cancelando) return;
    if (!confirm("¿Cancelar esta compra? Quedará como cancelada y podrás pedir de nuevo.")) return;
    setCancelando(true);
    setMsgCancel("");
    try {
      const res = await fetch("/api/mp/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo cancelar");
      const nuevo = await consultarEstado(reference);
      setEstado(nuevo);
      setMsgCancel("Compra cancelada. Tu canasta sigue intacta en la tienda.");
    } catch (e) {
      setMsgCancel(`⚠️ ${e.message}`);
    } finally {
      setCancelando(false);
    }
  }

  const paymentState = estado?.paymentState || "pending";
  const meta = MP_ESTADO_META[paymentState] || MP_ESTADO_META.error;
  const msg = MENSAJES[paymentState] || MENSAJES.error;
  const verificado = FINAL.includes(estado?.paymentState || "");
  const esPrueba = estado?.env === "sandbox";

  return (
    <div className="mx-auto max-w-2xl px-3 sm:px-5 py-8 flex flex-col gap-5">
      <div className="relieve overflow-hidden">
        <div className="cenefa" />
        <div className="hero-vino px-6 py-8 text-center relative overflow-hidden">
          <Wine size={40} color="#f0d48a" className="mx-auto mb-2" />
          <h1 className="font-display font-black text-3xl sm:text-4xl" style={{ color: "#fff8ea" }}>Resultado de tu pago</h1>
          <p className="text-[12px] font-extrabold tracking-[0.22em] mt-1" style={{ color: "#f0d48a" }}>
            VINO MOMPOX · PAGO SEGURO CON MERCADO PAGO{esPrueba ? " (PRUEBAS)" : ""}
          </p>
        </div>
        <div className="cenefa" />
      </div>

      {!reference ? (
        <div className="relieve-suave p-6 text-center flex flex-col gap-3">
          <p className="font-display font-bold text-xl">Consulta tu compra 🧾</p>
          <p className="text-sm font-semibold opacity-70">Escribe la referencia de tu pedido (ej: VM-MP-XXXXXX-XXXXXX).</p>
          <div className="flex gap-2">
            <input className="input-relieve uppercase" placeholder="VM-MP-…" value={refManual} onChange={(e) => setRefManual(e.target.value.toUpperCase())} />
            <button onClick={() => elegirReferencia(refManual)}
              className="btn-relieve btn-vino px-5 cursor-pointer whitespace-nowrap">Ver</button>
          </div>
          <Link href="/" className="text-xs font-bold underline opacity-70">← Volver a la tienda</Link>
        </div>
      ) : (
        <div className="relieve-suave p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="etiqueta" style={{ background: meta.color }}>{meta.emoji} {meta.titulo}</span>
          </div>

          <h2 className="font-display font-black text-2xl sm:text-3xl">{msg.titulo}</h2>
          <p className="text-sm font-semibold opacity-75 leading-relaxed">{msg.texto}</p>

          <div className="relieve-hundido px-4 py-3 text-sm font-bold flex flex-col gap-1.5">
            <div className="flex justify-between"><span className="opacity-60">Referencia</span><span className="font-mono">{reference}</span></div>
            <div className="flex justify-between"><span className="opacity-60">Total</span><span className="font-display font-black text-xl">{estado ? formatCOP(estado.total) : "…"}</span></div>
            {estado?.mp?.paymentId ? (
              <div className="flex justify-between"><span className="opacity-60">Pago MP</span><span className="font-mono text-xs">{estado.mp.paymentId}</span></div>
            ) : null}
            {estado?.mp?.paymentMethod ? (
              <div className="flex justify-between"><span className="opacity-60">Medio</span><span>{estado.mp.paymentMethod}</span></div>
            ) : null}
          </div>

          {cargando && !estado ? (
            <p className="text-sm font-bold flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Consultando el estado real de tu pago…</p>
          ) : null}
          {errorApi ? <p className="text-[13px] font-bold">⚠️ {errorApi}</p> : null}
          {!verificado && estado ? (
            <p className="text-[13px] font-semibold opacity-70">⏳ Aún sin confirmación final de Mercado Pago. Esta página se actualiza sola cuando el webhook confirme.</p>
          ) : null}
          {verificado ? (
            <p className="text-[13px] font-extrabold flex items-center gap-1.5" style={{ color: "#2e6b4f" }}><ShieldCheck size={14} /> Estado confirmado por Mercado Pago (webhook → base de datos).</p>
          ) : null}
          {msgCancel ? <p className="text-[13px] font-bold">{msgCancel}</p> : null}

          <div className="flex flex-wrap gap-2.5">
            <Link href="/" className="btn-relieve btn-crema px-5 py-2.5 text-sm cursor-pointer flex items-center gap-1.5">
              <ArrowLeft size={15} /> Volver a la tienda
            </Link>
            {(paymentState === "rejected" || paymentState === "cancelled" || paymentState === "error") ? (
              <Link href="/#catalogo" className="btn-relieve btn-dorado px-5 py-2.5 text-sm cursor-pointer flex items-center gap-1.5">
                <RotateCcw size={15} /> Intentar de nuevo
              </Link>
            ) : null}
            {paymentState === "pending" && estado ? (
              <button onClick={onCancelar} disabled={cancelando}
                className="btn-relieve px-5 py-2.5 text-sm cursor-pointer flex items-center gap-1.5 disabled:opacity-60" style={{ background: "#fff" }}>
                <Ban size={15} /> {cancelando ? "Cancelando…" : "Cancelar compra"}
              </button>
            ) : null}
          </div>
        </div>
      )}

      <p className="text-center text-[11px] font-semibold opacity-60">
        {esPrueba ? (
          <>Pagos de prueba con usuarios de prueba de Mercado Pago: ningún cobro es real.<br /></>
        ) : null}
        El exceso de alcohol es perjudicial para la salud · Prohíbese la venta a menores de edad.
      </p>
    </div>
  );
}

export default function PaginaResultadoMp() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-3 py-10"><p className="font-display text-2xl text-center">Cargando resultado… 🍷</p></div>}>
      <Contenido />
    </Suspense>
  );
}
