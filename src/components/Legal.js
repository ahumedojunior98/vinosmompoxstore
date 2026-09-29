"use client";

import { useEffect, useState } from "react";
import { Wine } from "lucide-react";
import {
  leerConsentimiento, guardarConsentimiento, aplicarAnalitica,
  esMayorEdad, guardarMayorEdad,
} from "@/lib/consent";

/* Aviso de cookies: necesarias siempre, analítica solo con tu permiso. */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    aplicarAnalitica();
    if (!leerConsentimiento()) setVisible(true);
  }, []);
  if (!visible) return null;
  function elegir(analitica) {
    guardarConsentimiento(analitica);
    setVisible(false);
  }
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de cookies"
      className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-[90] relieve-suave p-4 anim-pop"
      style={{ background: "#fffdf6" }}
    >
      <p className="font-display font-bold text-lg">🍪 Usamos pocas cookies</p>
      <p className="text-[13px] font-medium opacity-75 mt-1">
        Las necesarias para la canasta y tu sesión. La analítica solo con tu permiso.{" "}
        <a href="/cookies" className="underline font-bold">Ver política</a>
      </p>
      <div className="flex gap-2 mt-3">
        <button onClick={() => elegir(true)} className="btn-relieve btn-vino px-4 py-2 text-[13px] font-extrabold cursor-pointer flex-1">
          Aceptar
        </button>
        <button onClick={() => elegir(false)} className="btn-relieve btn-crema px-4 py-2 text-[13px] font-extrabold cursor-pointer flex-1">
          Rechazar
        </button>
      </div>
    </div>
  );
}

/* Puerta de edad: alcohol solo para mayores de 18 (Ley 124 de 1994). */
export function AgeGate() {
  const [visible, setVisible] = useState(false);
  const [negado, setNegado] = useState(false);
  useEffect(() => {
    if (!esMayorEdad()) setVisible(true);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(34,6,13,0.88)" }} role="dialog" aria-modal="true" aria-label="Verificación de edad">
      <div className="relieve overflow-hidden max-w-sm w-full anim-pop">
        <div className="cenefa" />
        <div className="hero-vino px-6 py-8 text-center flex flex-col items-center gap-3">
          <span className="w-14 h-14 flex items-center justify-center rounded-2xl" style={{ background: "linear-gradient(180deg,#93303f,#5c1420)", border: "2px solid #f0d48a" }}>
            <Wine size={28} color="#f0d48a" />
          </span>
          {!negado ? (
            <>
              <p className="font-display font-black text-2xl" style={{ color: "#fff8ea" }}>¿Tienes 18 años o más?</p>
              <p className="text-[13px] font-semibold" style={{ color: "#cbb98f" }}>
                Vendemos vino: por ley solo entran mayores de edad.
              </p>
              <div className="flex gap-2.5 mt-1">
                <button
                  onClick={() => { guardarMayorEdad(); setVisible(false); }}
                  className="btn-relieve btn-dorado px-6 py-2.5 text-sm font-extrabold cursor-pointer"
                >
                  Sí, tengo 18+
                </button>
                <button
                  onClick={() => setNegado(true)}
                  className="btn-relieve px-6 py-2.5 text-sm font-extrabold cursor-pointer"
                  style={{ background: "transparent", color: "#fff8ea", borderColor: "#f0d48a" }}
                >
                  No
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-display font-black text-2xl" style={{ color: "#fff8ea" }}>Aquí no puedes entrar todavía</p>
              <p className="text-[13px] font-semibold" style={{ color: "#cbb98f" }}>
                Prohibida la venta de alcohol a menores (Ley 124 de 1994). Vuelve cuando cumplas 18. 🍷
              </p>
            </>
          )}
        </div>
        <div className="cenefa" />
      </div>
    </div>
  );
}
