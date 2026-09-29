"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Wine, ShieldCheck, ShieldAlert, Loader2, ArrowLeft, RotateCcw, Ban } from "lucide-react";
import { formatCOP } from "@/lib/utils";
import { ESTADO_META, mapTransactionState } from "@/lib/payu";
import { useSesion, guardarCarritoNube } from "@/lib/auth";

const FINAL = ["paid", "rejected", "cancelled", "error"];

const MENSAJES = {
  paid: {
    titulo: "¡Pago aprobado! 🍷",
    texto: "PayU confirmó tu pago y tu pedido entró a la bodega. Te escribiremos por WhatsApp para coordinar la entrega.",
  },
  rejected: {
    titulo: "Pago rechazado",
    texto: "El banco o PayU rechazó la transacción (fondos, datos de la tarjeta o validación). Tu canasta sigue intacta: puedes intentarlo con otro medio.",
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
};

function Contenido() {
  const params = useSearchParams();
  const sesion = useSesion();
  const [refManual, setRefManual] = useState("");
  const [reference, setReference] = useState("");
  const [estado, setEstado] = useState(null); // {paymentState, total, ...}
  const [cargando, setCargando] = useState(true);
  const [errorApi, setErrorApi] = useState("");
  const [firmaUrl, setFirmaUrl] = useState(null); // true/false/null
  const [cancelando, setCancelando] = useState(false);
  const [msgCancel, setMsgCancel] = useState("");
  const intentos = useRef(0);
  const carritoLimpio = useRef(false);

  // Referencia: primero la URL de PayU, si no hay, la que digite el usuario.
  useEffect(() => {
    const ref = String(params.get("referenceCode") || "").trim().toUpperCase();
    if (ref) setReference(ref);
    else setCargando(false);
  }, [params]);

  const consultarEstado = useCallback(async (ref) => {
    const res = await fetch(`/api/payu/estado?reference=${encodeURIComponent(ref)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error === "orden_inexistente" ? "orden_inexistente" : data.error || `Error ${res.status}`);
    return data;
  }, []);

  // Polling del estado REAL (fuente de verdad = webhook → Firestore).
  useEffect(() => {
    if (!reference) return;
    let vivo = true;
    setCargando(true);
    setErrorApi("");
    intentos.current = 0;
    async function ronda() {
      try {
        const data = await consultarEstado(reference);
        if (!vivo) return;
        setEstado(data);
        setErrorApi("");
        if (FINAL.includes(data.paymentState)) return; // estado final: parar
      } catch (e) {
        if (!vivo) return;
        setErrorApi(e.message === "orden_inexistente" ? "No existe una orden con esa referencia." : "No pude consultar el estado todavía. Reintentando…");
      }
      intentos.current += 1;
      if (vivo && intentos.current < 22) setTimeout(ronda, 4000);
    }
    ronda();
    return () => { vivo = false; };
  }, [reference, consultarEstado]);

  // Validación display de la firma que trae la URL (no cambia estados).
  useEffect(() => {
    const signature = params.get("signature");
    const referenceCode = params.get("referenceCode");
    if (!signature || !referenceCode) {
      setFirmaUrl(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/payu/validar-respuesta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantId: params.get("merchantId"),
            referenceCode,
            txValue: params.get("TX_VALUE"),
            currency: params.get("currency"),
            transactionState: params.get("transactionState"),
            signature,
          }),
        });
        const data = await res.json().catch(() => ({}));
        setFirmaUrl(data.firmaValida === true);
      } catch {
        setFirmaUrl(null);
      }
    })();
  }, [params]);

  // Al confirmarse el pago: limpiar la canasta local y en la nube.
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
      const res = await fetch("/api/payu/cancelar", {
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

  const paymentState = estado?.paymentState || (params.get("transactionState") ? mapTransactionState(params.get("transactionState")) : "pending");
  // Entorno real de la orden (viene del servidor, no de la URL): solo rótulos.
  const payuEnv = estado?.env === "production" ? "production" : estado?.env === "sandbox" ? "sandbox" : null;
  const nombreAmbiente = payuEnv === "production" ? "PAGO SEGURO CON PAYU" : payuEnv === "sandbox" ? "PAGO SEGURO CON PAYU (PRUEBAS)" : "PAGO SEGURO CON PAYU";
  const meta = ESTADO_META[paymentState] || ESTADO_META.error;
  const msg = MENSAJES[paymentState] || MENSAJES.error;
  const verificado = FINAL.includes(estado?.paymentState || "");

  return (
    <div className="mx-auto max-w-2xl px-3 sm:px-5 py-8 flex flex-col gap-5">
      <div className="relieve overflow-hidden">
        <div className="cenefa" />
        <div className="hero-vino px-6 py-8 text-center relative overflow-hidden">
          <Wine size={40} color="#f0d48a" className="mx-auto mb-2" />
          <h1 className="font-display font-black text-3xl sm:text-4xl" style={{ color: "#fff8ea" }}>Resultado de tu pago</h1>
          <p className="text-[12px] font-extrabold tracking-[0.22em] mt-1" style={{ color: "#f0d48a" }}>VINO MOMPOX · {nombreAmbiente}</p>
        </div>
        <div className="cenefa" />
      </div>

      {!reference ? (
        <div className="relieve-suave p-6 text-center flex flex-col gap-3">
          <p className="font-display font-bold text-xl">Consulta tu compra 🧾</p>
          <p className="text-sm font-semibold opacity-70">Escribe la referencia de tu pedido (ej: VM-XXXXXX-XXXXXX).</p>
          <div className="flex gap-2">
            <input className="input-relieve uppercase" placeholder="VM-…" value={refManual} onChange={(e) => setRefManual(e.target.value.toUpperCase())} />
            <button onClick={() => refManual.trim() && setReference(refManual.trim())}
              className="btn-relieve btn-vino px-5 cursor-pointer whitespace-nowrap">Ver</button>
          </div>
          <a href="/" className="text-xs font-bold underline opacity-70">← Volver a la tienda</a>
        </div>
      ) : (
        <div className="relieve-suave p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="etiqueta" style={{ background: meta.color }}>{meta.emoji} {meta.titulo}</span>
            {firmaUrl === true ? (
              <span className="text-[11px] font-extrabold flex items-center gap-1" style={{ color: "#2e6b4f" }}><ShieldCheck size={13} /> URL verificada por PayU</span>
            ) : firmaUrl === false ? (
              <span className="text-[11px] font-extrabold flex items-center gap-1" style={{ color: "#7a1e2b" }}><ShieldAlert size={13} /> URL con firma inválida: guíate por el estado verificado</span>
            ) : null}
          </div>

          <h2 className="font-display font-black text-2xl sm:text-3xl">{msg.titulo}</h2>
          <p className="text-sm font-semibold opacity-75 leading-relaxed">{msg.texto}</p>

          <div className="relieve-hundido px-4 py-3 text-sm font-bold flex flex-col gap-1.5">
            <div className="flex justify-between"><span className="opacity-60">Referencia</span><span className="font-mono">{reference}</span></div>
            <div className="flex justify-between"><span className="opacity-60">Total</span><span className="font-display font-black text-xl">{estado ? formatCOP(estado.total) : "…"}</span></div>
            {estado?.payu?.transactionId ? (
              <div className="flex justify-between"><span className="opacity-60">Transacción PayU</span><span className="font-mono text-xs">{estado.payu.transactionId}</span></div>
            ) : null}
            {estado?.payu?.paymentMethod ? (
              <div className="flex justify-between"><span className="opacity-60">Medio</span><span>{estado.payu.paymentMethod}</span></div>
            ) : null}
          </div>

          {cargando && !estado ? (
            <p className="text-sm font-bold flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Consultando el estado real de tu pago…</p>
          ) : null}
          {errorApi ? <p className="text-[13px] font-bold">⚠️ {errorApi}</p> : null}
          {!verificado && estado ? (
            <p className="text-[13px] font-semibold opacity-70">⏳ Aún sin confirmación final de PayU. Esta página se actualiza sola cuando el webhook confirme.</p>
          ) : null}
          {verificado ? (
            <p className="text-[13px] font-extrabold flex items-center gap-1.5" style={{ color: "#2e6b4f" }}><ShieldCheck size={14} /> Estado confirmado por PayU (webhook → base de datos).</p>
          ) : null}
          {msgCancel ? <p className="text-[13px] font-bold">{msgCancel}</p> : null}

          <div className="flex flex-wrap gap-2.5">
            <a href="/" className="btn-relieve btn-crema px-5 py-2.5 text-sm cursor-pointer flex items-center gap-1.5">
              <ArrowLeft size={15} /> Volver a la tienda
            </a>
            {(paymentState === "rejected" || paymentState === "cancelled" || paymentState === "error") ? (
              <a href="/#catalogo" className="btn-relieve btn-dorado px-5 py-2.5 text-sm cursor-pointer flex items-center gap-1.5">
                <RotateCcw size={15} /> Intentar de nuevo
              </a>
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
        {payuEnv === "sandbox" ? (
          <>Pagos de prueba en ambiente Sandbox de PayU: ningún cobro es real.<br /></>
        ) : null}
        El exceso de alcohol es perjudicial para la salud · Prohíbese la venta a menores de edad.
      </p>
    </div>
  );
}

export default function PaginaResultado() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-3 py-10"><p className="font-display text-2xl text-center">Cargando resultado… 🍷</p></div>}>
      <Contenido />
    </Suspense>
  );
}
