"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Wine, ShoppingBasket, Plus, Minus, Trash2, Search, MapPin,
  Phone, Truck, BadgeCheck, Leaf, Flame, X, Send, Store,
  Sparkles, Star, Gift, ChevronRight, ChevronLeft, MessageCircle, Grape,
  Landmark, HandHeart, PackageCheck, LogOut, Crown,
} from "lucide-react";
import { formatCOP, precioFinal } from "@/lib/utils";
import {
  motion, useScroll, useTransform, useSpring, useMotionValue, useInView, animate,
} from "motion/react";
import {
  useSesion, loginConGoogle, salir,
  leerCarritoNube, guardarCarritoNube, subscribeCarrito, registrarCompraUsuario,
} from "@/lib/auth";
import {
  CATEGORIAS, METODOS_PAGO, WHATSAPP_NUMBER, PAGO_MP, PAGO_PAYU,
  subscribeCatalogo, crearPedido, mensajeWhatsApp,
} from "@/lib/tienda";
import { subscribeZonas, zonasActivas, calcularEnvio, zonaPorId, detectarZona, DEPARTAMENTOS, deptoDeCiudad } from "@/lib/envios";

/* ---------- Reveal on scroll ---------- */
function useReveal(deps = []) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("reveal-visible"); io.unobserve(e.target); }
      }),
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

const CATEGORIA_META = {
  "Vino de Corozo": { emoji: "🍷", color: "#7a1e2b" },
  "Vino de Mango": { emoji: "🥭", color: "#d98a1f" },
  "Vino de Mamón": { emoji: "💚", color: "#2e6b4f" },
  "Vino de Ciruela": { emoji: "🟣", color: "#6b2d6e" },
  "Vino de Maracuyá": { emoji: "💛", color: "#b78a00" },
  "Combo Promocional": { emoji: "🎁", color: "#1e6e8c" },
  Otro: { emoji: "✨", color: "#8a5a33" },
};

function Anuncio() {
  const items = ["HECHO EN MOMPOX", "VINO DE COROZO", "100% ARTESANAL", "PAGO NEQUI · EFECTIVO", "PEDIDOS POR WHATSAPP", "FRUTA REAL DEL CARIBE"];
  const fila = [...items, ...items];
  return (
    <div className="marquee py-2 text-[11px] font-extrabold tracking-[0.18em]" style={{ background: "#22060d", color: "#f0d48a" }}>
      <div className="marquee-track">
        {[0, 1].map((k) => (
          <span key={k} className="flex gap-10 items-center">
            {fila.map((t, i) => <span key={i} className="flex items-center gap-10"><span>{t}</span><span style={{ color: "#c99a2b" }}>◆</span></span>)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Header({ cartCount, bumpKey, onOpenCart, sesion, entrando, onLogin, onLogout }) {
  const { fbUser, perfil } = sesion || {};
  return (
    <header className="sticky top-0 z-40">
      <div style={{ background: "rgba(250,244,232,0.88)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "2px solid #3d2b1f" }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-3 flex items-center justify-between gap-3">
          <a href="#top" className="flex items-center gap-3 group">
            <span className="relative flex items-center h-[52px] px-2.5 shrink-0 transition-transform group-hover:-rotate-2"
              style={{ background: "linear-gradient(180deg,#fffdf6,#f7ead0)", border: "2px solid #3d2b1f", borderRadius: "1rem", boxShadow: "3px 3px 0 #3d2b1f" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-vino-mompox.png" alt="Vino Mompox" className="h-10 w-auto" />
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center text-[10px]" style={{ background: "#f0d48a", border: "2px solid #3d2b1f", borderRadius: "999px" }}>★</span>
            </span>
            <span>
              <span className="block text-[10px] font-extrabold uppercase tracking-[0.22em]" style={{ color: "#b3402a" }}>Mompox · Bolívar · Caribe</span>
              <span className="font-display font-black text-[20px] leading-none" style={{ color: "#4a0f1a" }}>Tienda oficial 🍷</span>
            </span>
          </a>
          <nav className="hidden lg:flex items-center gap-1 text-[13px] font-extrabold">
            {[["Vinos", "#catalogo"], ["Combos", "#combos"], ["Historia", "#historia"], ["Opiniones", "#opiniones"], ["Cómo pedir", "#pedido"]].map(([label, href]) => (
              <a key={href} href={href} className="px-3 py-1.5 rounded-full hover:bg-[#3d2b1f] hover:text-[#fff8ea] transition-colors">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {fbUser ? (
              <span className="hidden sm:flex items-center gap-2 pl-1 pr-2 py-1 rounded-full" style={{ background: "#fff", border: "2px solid #3d2b1f" }} title={perfil?.email || fbUser.email || ""}>
                {perfil?.photoURL || fbUser.photoURL
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={perfil?.photoURL || fbUser.photoURL} alt="" className="w-7 h-7 rounded-full" style={{ border: "2px solid #3d2b1f" }} />
                  : <span className="w-7 h-7 rounded-full flex items-center justify-center font-black" style={{ background: "#f0d48a", border: "2px solid #3d2b1f" }}>{(perfil?.displayName || fbUser.email || "?")[0]?.toUpperCase()}</span>}
                <span className="text-xs font-extrabold max-w-[110px] truncate">
                  {(perfil?.displayName || fbUser.email || "").split(" ")[0]}
                </span>
                {perfil?.role === "admin" ? <Crown size={13} color="#8a5a1a" /> : null}
                <button onClick={onLogout} title="Cerrar sesión" className="cursor-pointer opacity-60 hover:opacity-100"><LogOut size={14} /></button>
              </span>
            ) : (
              <button onClick={onLogin} disabled={entrando}
                className="btn-relieve btn-crema px-3.5 py-2.5 text-[13px] cursor-pointer hidden sm:flex items-center gap-1.5 disabled:opacity-60">
                🔑 {entrando ? "…" : "Entrar"}
              </button>
            )}
            <button onClick={onOpenCart} className="btn-relieve btn-vino btn-shine px-4 py-2.5 text-sm flex items-center gap-2 cursor-pointer">
              <ShoppingBasket size={17} />
              <span className="hidden sm:inline">Canasta</span>
              <span key={bumpKey} className={bumpKey > 0 ? "anim-bump inline-flex items-center justify-center min-w-6 h-6 px-1 text-xs font-black rounded-full" : "inline-flex items-center justify-center min-w-6 h-6 px-1 text-xs font-black rounded-full"}
                style={{ background: "#f0d48a", color: "#3d2b1f", border: "2px solid #3d2b1f" }}>{cartCount}</span>
            </button>
          </div>
          {fbUser ? (
            <button onClick={onLogout} className="sm:hidden text-[11px] font-extrabold underline opacity-70 cursor-pointer">Salir ({(perfil?.displayName || "").split(" ")[0] || "cuenta"})</button>
          ) : (
            <button onClick={onLogin} disabled={entrando} className="sm:hidden text-[11px] font-extrabold underline opacity-70 cursor-pointer">🔑 Entrar con Google</button>
          )}
        </div>
      </div>
    </header>
  );
}

const EASE_OUT = [0.22, 1, 0.36, 1];

function LineaReveal({ children, delay = 0 }) {
  return (
    <span className="block overflow-hidden pb-1">
      <motion.span
        className="block"
        initial={{ y: "112%" }}
        animate={{ y: "0%" }}
        transition={{ duration: 0.9, delay, ease: EASE_OUT }}
      >
        {children}
      </motion.span>
    </span>
  );
}

function Contador({ valor, sufijo = "" }) {
  const ref = useRef(null);
  const enVista = useInView(ref, { once: true, margin: "-40px" });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enVista) return;
    const objetivo = Number(valor) || 0;
    const controls = animate(0, objetivo, {
      duration: 1.6,
      ease: EASE_OUT,
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => controls.stop();
  }, [enVista, valor]);
  return (
    <span ref={ref}>
      {n}
      {sufijo}
    </span>
  );
}

function Hero({ totalVinos, ofertas, onVerCatalogo, onVerCombos }) {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const yTexto = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const yVitrina = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const fadeHero = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 55, damping: 16 });
  const sy = useSpring(my, { stiffness: 55, damping: 16 });
  const vitrinaX = useTransform(sx, (v) => v * 30);
  const vitrinaY = useTransform(sy, (v) => v * 22);
  const vitrinaR = useTransform(sx, (v) => v * 4);
  const fondoX = useTransform(sx, (v) => v * -14);

  function onPointerMove(e) {
    const r = sectionRef.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }

  return (
    <section ref={sectionRef} onPointerMove={onPointerMove} className="relieve overflow-hidden">
      <div className="cenefa" />
      <div className="relative px-5 sm:px-10 pt-10 sm:pt-14 pb-8 grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center overflow-hidden" style={{ background: "#22060d" }}>
        {/* Foto real — banner principal */}
        <motion.div style={{ x: fondoX, scale: 1.06 }} className="pointer-events-none absolute inset-0" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-vino-mompox-foto.jpg" alt="" className="ken-burns h-full w-full object-cover" />
        </motion.div>
        {/* Scrims para legibilidad */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(100deg, rgba(28,5,10,0.95) 0%, rgba(34,6,13,0.85) 38%, rgba(74,15,26,0.5) 65%, rgba(74,15,26,0.3) 100%)" }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28" style={{ background: "linear-gradient(180deg, transparent, rgba(28,5,10,0.75))" }} />
        <div className="filigrana pointer-events-none absolute inset-0 opacity-40" />
        <div className="grain pointer-events-none absolute inset-0" />

        <motion.div style={{ y: yTexto, opacity: fadeHero }} className="relative">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
            className="flex flex-wrap gap-2 mb-5"
          >
            <span className="etiqueta" style={{ background: "#f0d48a" }}><Sparkles size={12} /> 100% Artesanal</span>
            <span className="etiqueta" style={{ background: "rgba(255,253,246,0.92)" }}>🌴 Santa Cruz de Mompox</span>
            {ofertas > 0 ? <span className="etiqueta anim-pop" style={{ background: "#ff9d8a" }}><Flame size={12} /> {ofertas} ofertas hoy</span> : null}
          </motion.div>
          <motion.p
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: EASE_OUT }}
            className="text-[12px] font-extrabold tracking-[0.28em] mb-3"
            style={{ color: "#f0d48a" }}
          >
            — DESDE 2024 · EDICIÓN PEQUEÑA —
          </motion.p>
          <h1 className="font-display font-black text-[42px] sm:text-6xl xl:text-7xl leading-[1.02]" style={{ color: "#fff8ea" }}>
            <LineaReveal delay={0.15}>El vino del río,</LineaReveal>
            <LineaReveal delay={0.27}>
              <span className="italic font-bold gold-text">fermentado a mano</span>
            </LineaReveal>
            <LineaReveal delay={0.39}>en Mompox.</LineaReveal>
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: EASE_OUT }}
            className="mt-5 text-[15px] sm:text-[17px] font-medium leading-relaxed max-w-xl"
            style={{ color: "#f3e9d2" }}
          >
            Corozo, mango, mamón, ciruela y maracuyá del Caribe. Dulces, vivos y de lote pequeño.
            <strong className="font-extrabold" style={{ color: "#ffe9a8" }}> Pide aquí y te lo llevamos.</strong>
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.62, ease: EASE_OUT }}
            className="mt-7 flex flex-wrap gap-3"
          >
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={onVerCatalogo}
              className="btn-relieve btn-dorado btn-shine px-7 py-3.5 cursor-pointer flex items-center gap-2 text-[15px]"
            >
              <Wine size={19} /> Ver los vinos <ChevronRight size={17} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={onVerCombos}
              className="glass-dark px-7 py-3.5 cursor-pointer flex items-center gap-2 text-[15px] font-extrabold rounded-2xl"
              style={{ color: "#fff8ea", borderRadius: "1rem" }}
            >
              <Gift size={18} color="#f0d48a" /> Combos 🎁
            </motion.button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.74, ease: EASE_OUT }}
            className="mt-8 grid grid-cols-3 max-w-md rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(240,212,138,0.35)" }}
          >
            {[[totalVinos, "", "vinos en bodega"], ["5", "", "frutas del Caribe"], ["100", "%", "fruta real"]].map(([n, suf, l], i) => (
              <div key={i} className="px-4 py-3 text-center" style={{ background: i % 2 ? "rgba(240,212,138,0.12)" : "rgba(0,0,0,0.25)" }}>
                <p className="font-display font-black text-2xl" style={{ color: "#ffe9a8" }}>
                  <Contador valor={n} sufijo={suf} />
                </p>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#f3e9d2" }}>{l}</p>
              </div>
            ))}
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] font-bold"
            style={{ color: "#f3e9d2" }}
          >
            <span className="flex items-center gap-1.5"><BadgeCheck size={15} color="#f0d48a" /> Nequi · Efectivo · Transferencia</span>
            <span className="flex items-center gap-1.5"><Truck size={15} color="#f0d48a" /> Entrega por WhatsApp</span>
            <span className="flex items-center gap-1.5"><Leaf size={15} color="#f0d48a" /> Sin afanes, como en Mompox</span>
          </motion.div>
        </motion.div>

        {/* Vitrina botella con parallax */}
        <motion.div style={{ y: yVitrina }} className="relative hidden lg:flex justify-center items-center min-h-[480px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4, ease: EASE_OUT }}
            className="absolute w-[380px] h-[380px] rounded-full anim-glow"
            style={{ background: "radial-gradient(circle, rgba(201,154,43,0.45), transparent 65%)" }}
          />
          <div className="absolute w-[300px] h-[300px] rounded-full anim-spin-slow" style={{ border: "1.5px dashed rgba(240,212,138,0.5)" }} />
          <motion.div style={{ x: vitrinaX, y: vitrinaY, rotate: vitrinaR }} className="relative">
            <motion.div
              animate={{ y: [0, -14, 0], rotate: [3, 1.6, 3] }}
              transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <div className="relieve p-6 pt-5 text-center w-72" style={{ background: "linear-gradient(180deg,#fffdf6,#f7ead0)" }}>
                <div className="cenefa !mx-[-1.5rem] !-mt-5 mb-4" style={{ borderRadius: "0" }} />
                <div className="mx-auto w-full h-72 rounded-2xl relative overflow-hidden"
                  style={{ border: "2px solid #3d2b1f", background: "#fffdf6" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/botella-corozo.png" alt="Botella Vino Mompox · Vino de Corozo" className="w-full h-72 object-cover object-top" />
                  <span className="shine-sweep" aria-hidden="true" />
                  <span className="etiqueta absolute top-3 left-3" style={{ background: "#f0d48a" }}>El insignia</span>
                  <div className="absolute inset-x-0 bottom-0 px-4 pt-8 pb-3 text-left" style={{ background: "linear-gradient(180deg, transparent, rgba(34,6,13,0.88))" }}>
                    <p className="font-display italic font-bold text-lg leading-none" style={{ color: "#ffe9a8" }}>Vino de Corozo</p>
                    <p className="text-[10px] font-extrabold tracking-[0.25em] mt-1" style={{ color: "#f3e9d2" }}>750 ML · DULCE · 2026</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-center gap-1" style={{ color: "#c99a2b" }}>
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={15} fill="#c99a2b" />)}
                  <span className="text-xs font-extrabold ml-1" style={{ color: "#3d2b1f" }}>5.0</span>
                </div>
                <p className="text-[12.5px] font-semibold mt-1 opacity-75">“El que todo el mundo repite. Rojo profundo, dulce, momposino.”</p>
              </div>
              <motion.div
                animate={{ y: [0, -9, 0], rotate: [-6, -4, -6] }}
                transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-14 top-8 relieve-suave px-3 py-2 text-xs font-black flex items-center gap-1.5"
                style={{ background: "#ddf0da" }}
              >
                <Leaf size={14} color="#2e6b4f" /> Fruta real
              </motion.div>
              <motion.div
                animate={{ y: [0, 10, 0], rotate: [5, 3, 5] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                className="absolute -right-10 bottom-16 relieve-suave px-3 py-2 text-xs font-black flex items-center gap-1.5"
                style={{ background: "#fff" }}
              >
                <Flame size={14} color="#b3402a" /> Lote pequeño
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
      <div className="cenefa" />
    </section>
  );
}

function TiraSabores() {
  const sabores = [["🍷", "Corozo"], ["🥭", "Mango"], ["💚", "Mamón"], ["🟣", "Ciruela"], ["💛", "Maracuyá"], ["🎁", "Combos"]];
  return (
    <div className="marquee relieve-suave !py-3 px-2" style={{ background: "linear-gradient(180deg,#fffdf6,#faf0d8)" }}>
      <div className="marquee-track font-display font-bold text-lg" style={{ color: "#4a0f1a" }}>
        {[0, 1].map((k) => (
          <span key={k} className="flex gap-10 items-center">
            {[...sabores, ...sabores].map(([e, t], i) => (
              <span key={i} className="flex items-center gap-2">{e} {t} <span style={{ color: "#c99a2b" }}>✦</span></span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProductCard({ p, qty, index, onAdd, onMore, onLess }) {
  const final = precioFinal(p);
  const tieneDcto = Number(p.discount) > 0;
  const agotado = (Number(p.stock) || 0) <= 0 && p.type !== "combo";
  const pocas = !agotado && (Number(p.stock) || 0) <= 6 && p.type !== "combo";
  const meta = CATEGORIA_META[p.category] || CATEGORIA_META.Otro;
  const stockPct = p.type === "combo" ? 100 : Math.min(100, Math.max(6, ((Number(p.stock) || 0) / 24) * 100));
  return (
    <article className={`reveal stagger-${(index % 6) + 1} card-vino relieve-suave overflow-hidden p-0 flex flex-col`}>
      <div className="relative img-zoom overflow-hidden">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.name} loading="lazy" className="w-full h-60 object-cover" />
        ) : (
          <div className="w-full h-60 flex flex-col items-center justify-center gap-2 textura-arena relative"
            style={{ background: `linear-gradient(150deg, ${meta.color}22, #f7ead0 70%)` }}>
            <span className="text-5xl">{meta.emoji}</span>
            <Wine size={40} color={meta.color} strokeWidth={1.6} />
            <p className="font-display italic font-bold opacity-60">Vino artesanal</p>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 pointer-events-none" style={{ background: "linear-gradient(180deg, transparent, rgba(34,6,13,0.55))" }} />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <span className="etiqueta" style={{ background: p.type === "combo" ? "#9fd0e8" : "#f0d48a" }}>
            {p.type === "combo" ? "🎁 Combo" : `${meta.emoji} ${p.category?.replace("Vino de ", "") || "Vino"}`}
          </span>
        </div>
        {tieneDcto ? <span className="ribbon">-{p.discount}% HOY</span> : null}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
          <p className="font-display font-black text-[13px] uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ background: "rgba(255,248,234,0.92)", border: "2px solid #3d2b1f" }}>
            {agotado ? "⛔ Agotado" : p.type === "combo" ? "✨ Edición combo" : pocas ? `🔥 ¡Quedan ${p.stock}!` : `📦 ${p.stock} disponibles`}
          </p>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-display font-bold text-[21px] leading-tight">{p.name}</h3>
        {p.description ? <p className="text-[13px] font-medium opacity-75 leading-snug">{p.description}</p> : null}
        {p.type === "combo" && Array.isArray(p.comboItems) && p.comboItems.length > 0 ? (
          <p className="text-xs font-bold px-3 py-2 relieve-hundido">🎁 {p.comboItems.map((i) => `${i.qty}× ${i.name}`).join(" · ")}</p>
        ) : (
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#eee0c2", border: "1px solid rgba(61,43,31,0.4)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${stockPct}%`, background: pocas || agotado ? "linear-gradient(90deg,#d6543f,#b3402a)" : "linear-gradient(90deg,#2e6b4f,#3f8a66)" }} />
          </div>
        )}
        <div className="flex items-end justify-between mt-auto pt-1">
          <div>
            {tieneDcto ? (
              <>
                <p className="text-xs font-bold line-through opacity-50">{formatCOP(p.price)}</p>
                <p className="font-display font-black text-[27px] leading-none" style={{ color: "#7a1e2b" }}>{formatCOP(final)}</p>
              </>
            ) : <p className="font-display font-black text-[27px] leading-none">{formatCOP(p.price)}</p>}
            <p className="text-[11px] font-bold opacity-55 mt-0.5">{p.type === "combo" ? "Precio especial combo" : "Precio por botella"}</p>
          </div>
          {qty > 0 ? (
            <div className="flex items-center gap-1.5 anim-pop">
              <button onClick={onLess} aria-label="Quitar" className="btn-relieve btn-crema w-9 h-9 flex items-center justify-center cursor-pointer"><Minus size={15} /></button>
              <span className="font-black w-6 text-center text-lg">{qty}</span>
              <button onClick={onMore} aria-label="Agregar" className="btn-relieve btn-dorado w-9 h-9 flex items-center justify-center cursor-pointer"><Plus size={15} /></button>
            </div>
          ) : (
            <button onClick={onAdd} disabled={agotado} className="btn-relieve btn-vino btn-shine px-4 py-2.5 text-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
              <Plus size={15} /> {agotado ? "Agotado" : "Agregar"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* Carrusel horizontal con flechas y scroll-snap: ofertas y combos primero */
function CarruselDestacados({ items, cart, onAdd, onMore, onLess }) {
  const carril = useRef(null);
  function mover(dir) {
    const el = carril.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  }
  return (
    <section className="reveal flex flex-col gap-4 scroll-mt-28">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <p className="text-[11px] font-extrabold tracking-[0.25em]" style={{ color: "#b3402a" }}>— PARA LLEVAR YA —</p>
          <h2 className="font-display font-black text-3xl sm:text-4xl" style={{ color: "#4a0f1a" }}>
            Destacados <span className="italic" style={{ color: "#b3402a" }}>de la bodega</span>
          </h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => mover(-1)} aria-label="Anterior" className="btn-relieve btn-crema w-11 h-11 flex items-center justify-center cursor-pointer"><ChevronLeft size={18} /></button>
          <button onClick={() => mover(1)} aria-label="Siguiente" className="btn-relieve btn-crema w-11 h-11 flex items-center justify-center cursor-pointer"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div ref={carril} className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-1 px-1">
        {items.map((p) => (
          <div key={p.id} className="flex-none w-72 sm:w-80 snap-start">
            <ProductCard p={p} qty={cart[p.id] || 0}
              onAdd={() => onAdd(p.id)} onMore={() => onMore(p.id)} onLess={() => onLess(p.id)} />
          </div>
        ))}
      </div>
      <p className="text-xs font-bold opacity-60 text-center sm:hidden">Desliza 👉 para ver más</p>
    </section>
  );
}

function CartDrawer({ open, onClose, cart, productos, onMore, onLess, onRemove, onClear, subtotal, envio, total, zona, msgZona, sugerenciasCiudad, form, setForm, pago, setPago, enviando, error, okMsg, onPedir, payuEnv, mpEnv }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" style={{ background: "rgba(34,6,13,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <aside className="anim-slide-in absolute right-0 top-0 h-full w-full max-w-md flex flex-col overflow-hidden"
        style={{ background: "#faf4e8", borderLeft: "3px solid #3d2b1f", borderTopLeftRadius: "1.4rem", borderBottomLeftRadius: "1.4rem" }}>
        <div className="p-4 flex items-center justify-between relative overflow-hidden" style={{ background: "linear-gradient(120deg,#22060d,#7a1e2b)" }}>
          <div className="filigrana absolute inset-0 opacity-40" />
          <p className="relative font-display font-black text-2xl flex items-center gap-2" style={{ color: "#fff8ea" }}>
            <ShoppingBasket size={22} color="#f0d48a" /> Tu canasta
            <span className="text-xs font-extrabold px-2 py-0.5 rounded-full" style={{ background: "#f0d48a", color: "#3d2b1f" }}>{Object.values(cart).reduce((a, b) => a + b, 0)}</span>
          </p>
          <button onClick={onClose} className="relative cursor-pointer p-2 rounded-xl transition-transform hover:rotate-90" style={{ border: "2px solid #f0d48a", color: "#fff8ea" }}><X size={16} /></button>
        </div>
        <div className="cenefa" />
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
          {Object.keys(cart).length === 0 ? (
            <div className="relieve-suave p-8 text-center anim-fade-up">
              <span className="mx-auto w-16 h-16 flex items-center justify-center rounded-2xl" style={{ background: "#f3e9d2", border: "2px dashed #8a5a33" }}>
                <Grape size={30} className="opacity-50" />
              </span>
              <p className="font-display font-bold text-xl mt-3">Tu canasta está vacía</p>
              <p className="text-sm font-semibold opacity-70">Los mejores lotes vuelan. Agrega tus favoritos.</p>
              <button onClick={onClose} className="btn-relieve btn-dorado px-5 py-2.5 mt-4 text-sm cursor-pointer">🍷 Ver vinos</button>
            </div>
          ) : (
            <>
              {Object.entries(cart).map(([id, qty]) => {
                const p = productos.find((x) => x.id === id);
                if (!p) return null;
                const final = precioFinal(p);
                return (
                  <div key={id} className="relieve-suave !shadow-[3px_3px_0_rgba(61,43,31,0.85)] p-3 flex gap-3 items-center anim-fade-up">
                    {p.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.imageUrl} alt={p.name} className="w-14 h-14 object-cover shrink-0" style={{ border: "2px solid #3d2b1f", borderRadius: "0.8rem" }} />
                      : <div className="w-14 h-14 flex items-center justify-center shrink-0 text-xl" style={{ background: "#f0d48a", border: "2px solid #3d2b1f", borderRadius: "0.8rem" }}>{(CATEGORIA_META[p.category] || {}).emoji || "🍷"}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[13px] leading-tight truncate">{p.name}</p>
                      <p className="text-xs font-semibold opacity-60">{formatCOP(final)} c/u</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <button onClick={() => onLess(id)} className="cursor-pointer px-2 border-2 rounded-lg bg-white font-black hover:bg-[#f3e9d2]" style={{ borderColor: "#3d2b1f" }}>−</button>
                        <span className="font-black w-5 text-center text-sm">{qty}</span>
                        <button onClick={() => onMore(id)} className="cursor-pointer px-2 border-2 rounded-lg font-black" style={{ borderColor: "#3d2b1f", background: "#f0d48a" }}>+</button>
                        <button onClick={() => onRemove(id)} className="cursor-pointer ml-1 p-1.5 rounded-lg border-2 hover:bg-[#fbe3df]" style={{ borderColor: "#7a1e2b" }}><Trash2 size={13} color="#7a1e2b" /></button>
                      </div>
                    </div>
                    <p className="font-display font-black text-lg whitespace-nowrap">{formatCOP(final * qty)}</p>
                  </div>
                );
              })}
              <button onClick={onClear} className="text-xs font-bold underline opacity-60 cursor-pointer self-start hover:opacity-100">Vaciar canasta</button>
              <div id="pedido" className="relieve p-4 flex flex-col gap-3" style={{ background: "linear-gradient(180deg,#fffdf6,#faf0d8)" }}>
                <p className="font-display font-black text-xl flex items-center gap-2" style={{ color: "#4a0f1a" }}><PackageCheck size={20} /> Datos de entrega</p>
                <label className="text-[11px] font-extrabold uppercase tracking-wider">Nombre *<input className="input-relieve mt-1 normal-case" placeholder="Ej: Doña Carmen" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
                {pago === PAGO_PAYU || pago === PAGO_MP ? (
                  <label className="text-[11px] font-extrabold uppercase tracking-wider">Correo *<input type="email" className="input-relieve mt-1 normal-case" placeholder="tucorreo@ejemplo.com" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-extrabold uppercase tracking-wider">WhatsApp *<input className="input-relieve mt-1 normal-case" placeholder="300…" value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} /></label>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider">Pago<select className="input-relieve mt-1 normal-case cursor-pointer" value={pago} onChange={(e) => setPago(e.target.value)}>{METODOS_PAGO.map((m) => <option key={m}>{m}</option>)}</select></label>
                </div>
                <label className="text-[11px] font-extrabold uppercase tracking-wider">Dirección *<input className="input-relieve mt-1 normal-case" placeholder="Barrio, calle, referencia…" value={form.dir} onChange={(e) => setForm({ ...form, dir: e.target.value })} /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-extrabold uppercase tracking-wider">Ciudad *<input className="input-relieve mt-1 normal-case" placeholder="Ej: Barranquilla" list="vm-ciudades" value={form.ciudad || ""} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} /></label>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider">Departamento *<select className="input-relieve mt-1 normal-case cursor-pointer" value={form.depto || ""} onChange={(e) => { deptoAutoRef.current = false; setForm({ ...form, depto: e.target.value }); }}>
                    <option value="">— Elige —</option>
                    {DEPARTAMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select></label>
                </div>
                <datalist id="vm-ciudades">
                  {sugerenciasCiudad.map((c) => <option key={c} value={c} />)}
                </datalist>
                {msgZona ? <p className="text-[12px] font-extrabold anim-pop" style={{ color: zona ? "#2e6b4f" : (form.ciudad || "").trim().length >= 3 ? "#b3402a" : "#8a7a5a" }}>{msgZona}</p> : null}
                <div className="relieve-hundido px-3 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">🚚 Envío</span>
                  {zona ? (
                    <span className="text-right">
                      <span className="block text-[11px] font-bold opacity-60">{zona.nombre}</span>
                      <span className="font-display font-black text-xl" style={{ color: "#2e6b4f" }}>
                        {envio === 0 && Number(zona?.valor) > 0 ? "🎉 Gratis" : formatCOP(envio)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[12px] font-bold opacity-60 text-right">Se calcula al escribir tu ciudad 👆</span>
                  )}
                </div>
                <label className="text-[11px] font-extrabold uppercase tracking-wider">Nota (opcional)<input className="input-relieve mt-1 normal-case" placeholder="Ej: es para regalo…" value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} /></label>
                {error ? <p className="text-[13px] font-bold px-3 py-2 relieve-suave anim-pop" style={{ background: "#fbe3df", borderColor: "#7a1e2b" }}>⚠️ {error}</p> : null}
                {okMsg ? <p className="text-[13px] font-bold px-3 py-2 relieve-suave anim-pop" style={{ background: "#ddf0da", borderColor: "#2e6b4f" }}>{okMsg}</p> : null}
              </div>
            </>
          )}
        </div>
        {Object.keys(cart).length > 0 ? (
          <div className="p-4 flex flex-col gap-2" style={{ background: "#fffdf6", borderTop: "3px solid #3d2b1f" }}>
            <div className="flex justify-between font-bold text-sm"><span>Subtotal ({Object.values(cart).reduce((a, b) => a + b, 0)} botellas)</span><span>{formatCOP(subtotal)}</span></div>
            <div className="flex justify-between font-bold text-sm"><span>Envío{zona ? ` (${zona.nombre})` : ""}</span><span>{zona ? (envio === 0 && Number(zona?.valor) > 0 ? "🎉 Gratis" : formatCOP(envio)) : "— según tu ciudad —"}</span></div>
            <div className="flex justify-between items-center"><span className="font-display font-bold text-xl">Total</span><span className="font-display font-black text-3xl" style={{ color: "#7a1e2b" }}>{formatCOP(total)}</span></div>
            <button onClick={onPedir} disabled={enviando} className="btn-relieve btn-palma btn-shine w-full py-3.5 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 text-[15px]">
              <Send size={16} /> {enviando
                ? (pago === PAGO_MP ? "Conectando con Mercado Pago…" : pago === PAGO_PAYU ? "Conectando con PayU…" : "Guardando tu pedido…")
                : (pago === PAGO_MP
                  ? (mpEnv === "production" ? "💳 Pagar con Mercado Pago" : "💳 Pagar con Mercado Pago (prueba)")
                  : pago === PAGO_PAYU
                    ? (payuEnv === "production" ? "💳 Pagar con PayU" : "💳 Pagar con PayU (prueba)")
                    : "Confirmar por WhatsApp")}
            </button>
            <p className="text-[11px] font-semibold opacity-60 text-center">
              {pago === PAGO_MP
                ? (mpEnv === "production"
                  ? "Pago seguro con Mercado Pago. Se crea tu orden y vas al checkout seguro."
                  : "Ambiente de PRUEBAS de Mercado Pago: ningún cobro es real. Se crea tu orden y vas al checkout seguro.")
                : pago === PAGO_PAYU
                  ? (payuEnv === "production"
                    ? "Pago seguro con PayU. Se crea tu orden y vas al checkout seguro."
                    : "Ambiente de PRUEBAS de PayU: ningún cobro es real. Se crea tu orden y vas al checkout seguro.")
                  : `Se guarda en la tienda y se abre WhatsApp. Pago: ${pago}.`}
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export default function Tienda() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCat, setErrorCat] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroCat, setFiltroCat] = useState("Todas");
  const [soloOfertas, setSoloOfertas] = useState(false);
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [bumpKey, setBumpKey] = useState(0);
  const [form, setForm] = useState({ nombre: "", tel: "", dir: "", ciudad: "", depto: "", nota: "", email: "" });
  const [pago, setPago] = useState("Nequi");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [errorLogin, setErrorLogin] = useState("");
  const [payuEnv, setPayuEnv] = useState("sandbox");
  const [mpEnv, setMpEnv] = useState("sandbox");
  const [zonas, setZonas] = useState([]);
  const [zonaId, setZonaId] = useState("");
  const [msgZona, setMsgZona] = useState("");
  const [precioDetectado, setPrecioDetectado] = useState(null);
  const sesion = useSesion();
  const { fbUser, perfil } = sesion;
  // Evita que el subscribe del carrito pise cambios locales recién hechos
  const guardadoNubeRef = useRef(0);

  useEffect(() => {
    const unsub = subscribeCatalogo(
      (items) => { setProductos(items); setCargando(false); },
      (e) => { setErrorCat("No pude cargar los vinos: " + (e?.message || e)); setCargando(false); }
    );
    return () => unsub && unsub();
  }, []);

  // Zonas de envío (las define el admin en shipping_zones)
  useEffect(() => {
    const unsub = subscribeZonas(setZonas, () => setZonas([]));
    return () => unsub && unsub();
  }, []);

  // Entornos de pago efectivos (solo rótulos; el cobro real lo define el servidor).
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/payu/config-publica", { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (d?.env === "production") setPayuEnv("production");
      } catch { /* rótulo sandbox por defecto */ }
      try {
        const r = await fetch("/api/mp/config-publica", { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (d?.env === "production") setMpEnv("production");
      } catch { /* rótulo sandbox por defecto */ }
    })();
  }, []);

  // Carrito invitado: localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vino-mompox-cart");
      if (raw) setCart(JSON.parse(raw));
    } catch { /* canasta nueva */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("vino-mompox-cart", JSON.stringify(cart)); } catch { /* sin storage */ }
  }, [cart]);

  // Al entrar con Google: fusiona carrito local con el de la nube (suma cantidades)
  useEffect(() => {
    if (!fbUser) return;
    let vivo = true;
    (async () => {
      const nube = await leerCarritoNube(fbUser.uid);
      if (!vivo) return;
      setCart((local) => {
        const fusion = { ...nube };
        for (const [id, q] of Object.entries(local)) {
          fusion[id] = Math.max(Number(fusion[id]) || 0, Number(q) || 0);
        }
        guardadoNubeRef.current = Date.now();
        guardarCarritoNube(fbUser.uid, fusion);
        return fusion;
      });
      // Prellena el checkout con los datos de Google
      setForm((f) => ({
        ...f,
        nombre: f.nombre || fbUser.displayName || "",
        email: f.email || fbUser.email || "",
      }));
    })();
    return () => { vivo = false; };
  }, [fbUser]);

  // Escucha el carrito en otros dispositivos (solo si el cambio viene de fuera)
  useEffect(() => {
    if (!fbUser) return;
    const unsub = subscribeCarrito(fbUser.uid, (items) => {
      if (Date.now() - guardadoNubeRef.current > 1500) setCart(items);
    });
    return () => unsub();
  }, [fbUser]);

  // Guarda el carrito en la nube (debounced) cuando hay sesión
  useEffect(() => {
    if (!fbUser) return;
    const t = setTimeout(() => {
      guardadoNubeRef.current = Date.now();
      guardarCarritoNube(fbUser.uid, cart);
    }, 800);
    return () => clearTimeout(t);
  }, [cart, fbUser]);

  async function onLogin() {
    setErrorLogin("");
    setEntrando(true);
    try {
      await loginConGoogle();
    } catch (e) {
      const msg = String(e?.code || e?.message || e);
      if (msg.includes("auth/unauthorized-domain")) {
        setErrorLogin("Agrega este dominio en Firebase Console → Authentication → Settings → Authorized domains.");
      } else if (msg.includes("auth/popup-closed-by-user") || msg.includes("auth/cancelled-popup-request")) {
        setErrorLogin("Cerraste la ventana de Google. Intenta de nuevo.");
      } else if (msg.includes("auth/operation-not-allowed")) {
        setErrorLogin("Activa el provider Google en Firebase Console → Authentication → Sign-in method.");
      } else {
        setErrorLogin(e?.message || "No pude entrar con Google.");
      }
    } finally {
      setEntrando(false);
    }
  }

  async function onLogout() {
    try {
      await salir();
      setCart({});
      try { localStorage.removeItem("vino-mompox-cart"); } catch { /* nada */ }
    } catch (e) {
      setErrorLogin(e?.message || "No pude cerrar sesión.");
    }
  }

  const rootRef = useReveal([productos, cargando, filtroCat, soloOfertas, busqueda]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (soloOfertas && !(Number(p.discount) > 0)) return false;
      if (filtroCat !== "Todas" && p.category !== filtroCat && !(filtroCat === "Combo Promocional" && p.type === "combo")) return false;
      if (q && !(`${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [productos, busqueda, filtroCat, soloOfertas]);

  const combos = useMemo(() => productos.filter((p) => p.type === "combo"), [productos]);
  const sencillos = useMemo(() => filtrados.filter((p) => p.type !== "combo"), [filtrados]);
  const combosFiltrados = useMemo(() => filtrados.filter((p) => p.type === "combo"), [filtrados]);
  const ofertas = useMemo(() => productos.filter((p) => Number(p.discount) > 0).length, [productos]);
  const destacados = useMemo(() => {
    const conOferta = productos.filter((p) => Number(p.discount) > 0);
    const enCombo = productos.filter((p) => p.type === "combo" && !(Number(p.discount) > 0));
    const resto = productos.filter((p) => !(Number(p.discount) > 0) && p.type !== "combo");
    return [...conOferta, ...enCombo, ...resto].slice(0, 10);
  }, [productos]);

  const cartCount = useMemo(() => Object.values(cart).reduce((a, b) => a + (Number(b) || 0), 0), [cart]);
  const detalleCart = useMemo(() => Object.entries(cart).map(([id, qty]) => {
    const p = productos.find((x) => x.id === id);
    return { productId: id, name: p?.name || "", qty, unitPrice: p ? precioFinal(p) : 0 };
  }).filter((i) => i.qty > 0), [cart, productos]);
  const subtotal = useMemo(() => detalleCart.reduce((a, i) => a + i.qty * i.unitPrice, 0), [detalleCart]);
  const zonasDisponibles = useMemo(() => zonasActivas(zonas), [zonas]);
  // Ciudades sugeridas al escribir (salen de tus zonas + destinos del admin)
  const sugerenciasCiudad = useMemo(() => {
    const set = new Set();
    const cap = (s) => String(s || "").split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
    for (const z of zonasDisponibles) {
      for (const c of z.ciudades || []) if (c) set.add(cap(c));
      for (const d of z.destinos || []) if (d?.ciudad) set.add(cap(d.ciudad));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [zonasDisponibles]);
  const zona = useMemo(() => zonaPorId(zonasDisponibles, zonaId), [zonasDisponibles, zonaId]);
  // Zona efectiva: aplica el precio del destino detectado (ruta con precio
  // propio) sobre el valor base de la zona. Todo es automático: el cliente
  // solo escribe dirección, ciudad y departamento.
  const zonaEfectiva = useMemo(() => {
    if (!zona) return null;
    if (precioDetectado == null) return zona;
    return { ...zona, valor: precioDetectado };
  }, [zona, precioDetectado]);
  const envio = useMemo(() => calcularEnvio(zonaEfectiva, subtotal), [zonaEfectiva, subtotal]);
  const total = useMemo(() => subtotal + envio, [subtotal, envio]);

  // Detección automática: al escribir dirección, ciudad o departamento se
  // detecta la zona y el precio al instante. Sin selector manual.
  // Al elegir/escribir la ciudad se autocompleta el departamento.
  // Si el usuario lo cambia a mano, se respeta su elección.
  const deptoAutoRef = useRef(false);
  useEffect(() => {
    const d = deptoDeCiudad(form.ciudad);
    if (d) {
      deptoAutoRef.current = true;
      setForm((f) => (f.depto === d ? f : { ...f, depto: d }));
    } else if (deptoAutoRef.current) {
      deptoAutoRef.current = false;
      setForm((f) => ({ ...f, depto: "" }));
    }
  }, [form.ciudad]);
  const textoDestino = useMemo(
    () => [form.dir, form.ciudad, form.depto].filter(Boolean).join(" "),
    [form.dir, form.ciudad, form.depto]
  );
  useEffect(() => {
    if (!textoDestino || textoDestino.trim().length < 3) {
      setZonaId("");
      setPrecioDetectado(null);
      setMsgZona("");
      return;
    }
    const hallada = detectarZona(zonasDisponibles, textoDestino);
    if (hallada) {
      setZonaId(hallada.zona.id);
      setPrecioDetectado(hallada.precio);
      const etiqueta = hallada.match.charAt(0).toUpperCase() + hallada.match.slice(1);
      setMsgZona(
        hallada.esDestino
          ? `📍 Detectamos ${etiqueta}: ruta ${hallada.zona.nombre} a ${formatCOP(hallada.precio)}`
          : `📍 Detectamos ${etiqueta}: envío ${formatCOP(hallada.precio)} (${hallada.zona.nombre})`
      );
    } else {
      // Sin coincidencia: no hay zona y el total queda pendiente del envío
      setZonaId("");
      setPrecioDetectado(null);
      setMsgZona(
        (form.ciudad || "").trim().length >= 3
          ? "⚠️ Aún no llegamos a esa ciudad. Revisa la escritura o escríbenos por WhatsApp y coordinamos."
          : "⌨️ Elige tu departamento y escribe tu ciudad para calcular el envío"
      );
    }
  }, [textoDestino, zonasDisponibles]);

  function shippingPayload() {
    if (!zonaEfectiva) return { shippingZoneId: "", shipping: { zoneId: "", zoneName: "", cost: 0 } };
    return { shippingZoneId: zonaEfectiva.id, shipping: { zoneId: zonaEfectiva.id, zoneName: zonaEfectiva.nombre, cost: envio } };
  }

  function exigirZona() {
    if (!zonaEfectiva) { setError("Escribe tu ciudad y departamento para calcular el envío. Si no la detectamos, escríbenos por WhatsApp."); return false; }
    return true;
  }

  function addToCart(id, delta = 1) {
    const p = productos.find((x) => x.id === id);
    const stock = Number(p?.stock) || 0;
    let agregado = false;
    setCart((prev) => {
      const actual = Number(prev[id]) || 0;
      const next = actual + delta;
      if (next <= 0) { const n = { ...prev }; delete n[id]; return n; }
      if (p?.type !== "combo" && next > stock) return prev;
      if (delta > 0) agregado = true;
      return { ...prev, [id]: next };
    });
    if (agregado && delta > 0) setBumpKey((k) => k + 1);
  }

  function removeFromCart(id) {
    setCart((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  // Flujo PayU WebCheckout: crea orden interna (pending) y redirige al checkout oficial.
  // Solo se envían productId + qty: el total lo calcula el servidor desde Firestore.
  // La canasta NO se limpia aquí: si el pago falla o se abandona, sigue intacta.
  async function onPagarPayU() {
    setError(""); setOkMsg("");
    if (detalleCart.length === 0) { setError("Tu canasta está vacía."); return; }
    if (!exigirZona()) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/payu/crear-orden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: form.nombre, phone: form.tel, address: form.dir, ciudad: form.ciudad, depto: form.depto, email: form.email },
          items: detalleCart.map(({ productId, qty }) => ({ productId, qty })),
          ...shippingPayload(),
          notes: form.nota,
          uid: fbUser?.uid || null,
          userEmail: perfil?.email || fbUser?.email || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "No pude iniciar el pago con PayU.");
      setOkMsg(`✅ Orden ${data.reference} creada (${formatCOP(data.total)}). Abriendo PayU…`);
      const f = document.createElement("form");
      f.method = "POST";
      f.action = data.gatewayUrl;
      for (const [k, v] of Object.entries(data.formData || {})) {
        const inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = k;
        inp.value = String(v);
        f.appendChild(inp);
      }
      document.body.appendChild(f);
      f.submit();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  // Flujo Mercado Pago Checkout Pro: crea orden interna (pending) + preferencia
  // en el servidor y redirige al checkout oficial. Solo se envían
  // productId + qty: el total lo calcula el servidor desde Firestore.
  // La canasta NO se limpia aquí: si el pago falla o se abandona, sigue intacta.
  async function onPagarMP() {
    setError(""); setOkMsg("");
    if (detalleCart.length === 0) { setError("Tu canasta está vacía."); return; }
    if (!exigirZona()) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/mp/crear-preferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: form.nombre, phone: form.tel, address: form.dir, ciudad: form.ciudad, depto: form.depto, email: form.email },
          items: detalleCart.map(({ productId, qty }) => ({ productId, qty })),
          ...shippingPayload(),
          notes: form.nota,
          uid: fbUser?.uid || null,
          userEmail: perfil?.email || fbUser?.email || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.initPoint) throw new Error(data.error || "No pude iniciar el pago con Mercado Pago.");
      setOkMsg(`✅ Orden ${data.reference} creada (${formatCOP(data.total)}). Abriendo Mercado Pago…`);
      window.location.href = data.initPoint;
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function onPedir() {
    if (pago === PAGO_MP) return onPagarMP();
    if (pago === PAGO_PAYU) return onPagarPayU();
    setError(""); setOkMsg("");
    if (detalleCart.length === 0) { setError("Tu canasta está vacía."); return; }
    if (!exigirZona()) return;
    setEnviando(true);
    try {
      const ship = shippingPayload().shipping;
      const pedidoId = await crearPedido({
        customer: { name: form.nombre, phone: form.tel, address: form.dir, ciudad: form.ciudad, depto: form.depto },
        items: detalleCart,
        payment: pago,
        notes: form.nota,
        uid: fbUser?.uid || null,
        userEmail: perfil?.email || fbUser?.email || "",
        shipping: ship,
      });
      // Tracking del usuario (no bloquea si falla)
      registrarCompraUsuario(fbUser?.uid, total);
      setOkMsg("✅ ¡Pedido guardado! Te abrimos WhatsApp para confirmarlo…");
      const msg = mensajeWhatsApp({
        customer: { name: form.nombre, phone: form.tel, address: form.dir, ciudad: form.ciudad, depto: form.depto, notes: form.nota },
        items: detalleCart, subtotal, total, shipping: ship, payment: pago, pedidoId,
      });
      setCart({}); setForm({ nombre: "", tel: "", dir: "", ciudad: "", depto: "", nota: "", email: "" }); setZonaId("");
      setTimeout(() => window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank"), 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div id="top" ref={rootRef} className="min-h-screen">
      <Anuncio />
      <Header cartCount={cartCount} bumpKey={bumpKey} onOpenCart={() => setCartOpen(true)}
        sesion={sesion} entrando={entrando} onLogin={onLogin} onLogout={onLogout} />
      {errorLogin ? (
        <div className="mx-auto max-w-6xl w-full px-3 sm:px-5">
          <div className="relieve-suave px-4 py-3 text-sm font-bold anim-pop" style={{ background: "#fbe3df" }}>
            ⚠️ {errorLogin} <button className="underline ml-2 cursor-pointer" onClick={() => setErrorLogin("")}>Cerrar</button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-3 sm:px-5 py-5 flex flex-col gap-6">
        <Hero totalVinos={productos.length} ofertas={ofertas}
          onVerCatalogo={() => scrollTo("catalogo")} onVerCombos={() => scrollTo("combos")} />

        <TiraSabores />

        {!cargando && destacados.length > 0 ? (
          <CarruselDestacados
            items={destacados} cart={cart}
            onAdd={(id) => addToCart(id, 1)} onMore={(id) => addToCart(id, 1)} onLess={(id) => addToCart(id, -1)}
          />
        ) : null}

        {errorCat ? <div className="relieve-suave px-4 py-3 text-sm font-bold anim-pop" style={{ background: "#fbe3df" }}>⚠️ {errorCat}</div> : null}

        {/* Filtros premium */}
        <section id="catalogo" className="relieve overflow-hidden reveal scroll-mt-28">
          <div className="p-4 sm:p-5 flex flex-col gap-4" style={{ background: "linear-gradient(180deg,#fffdf6,#faf0d8)" }}>
            <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
              <div className="relative flex-1">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50" />
                <input className="input-relieve !pl-10 !py-3 !rounded-full" placeholder="Busca corozo, mango, combo…"
                  value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                {busqueda ? <button onClick={() => setBusqueda("")} className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer opacity-60 hover:opacity-100"><X size={15} /></button> : null}
              </div>
              <button onClick={() => setSoloOfertas(!soloOfertas)}
                className={`btn-relieve px-5 py-3 text-sm cursor-pointer flex items-center gap-2 whitespace-nowrap ${soloOfertas ? "btn-vino" : "btn-crema"}`}>
                <Flame size={15} /> {soloOfertas ? "Viendo ofertas ✦" : "Solo ofertas"}
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
              {["Todas", ...CATEGORIAS].map((c) => {
                const activo = filtroCat === c;
                const n = c === "Todas" ? productos.length : productos.filter((p) => p.category === c || (c === "Combo Promocional" && p.type === "combo")).length;
                return (
                  <button key={c} onClick={() => setFiltroCat(c)}
                    className="cursor-pointer whitespace-nowrap px-4 py-2 text-[13px] font-extrabold rounded-full transition-all hover:-translate-y-0.5"
                    style={activo
                      ? { background: "linear-gradient(180deg,#93303f,#5c1420)", color: "#fff8ea", border: "2px solid #3d2b1f", boxShadow: "3px 3px 0 #3d2b1f" }
                      : { background: "#fff", color: "#3d2b1f", border: "2px solid rgba(61,43,31,0.5)" }}>
                    {c === "Todas" ? "🍷 Todas" : `${(CATEGORIA_META[c] || {}).emoji || "•"} ${c.replace("Vino de ", "")}`} · {n}
                  </button>
                );
              })}
            </div>
            <p className="text-xs font-bold opacity-60 flex items-center gap-1.5">
              <Store size={13} /> {filtrados.length} productos en vitrina · Bodega Mompox · <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block anim-glow" style={{ background: "#2e6b4f" }} /> En vivo</span>
            </p>
          </div>
        </section>

        {cargando ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="relieve-suave p-4 flex flex-col gap-3 animate-pulse">
                <div className="w-full h-60 rounded-xl" style={{ background: "#eee0c2" }} />
                <div className="h-5 rounded-full w-3/4" style={{ background: "#eee0c2" }} />
                <div className="h-4 rounded-full w-1/2" style={{ background: "#eee0c2" }} />
              </div>
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="relieve p-12 text-center reveal reveal-visible">
            <p className="text-5xl">🍷</p>
            <p className="font-display font-black text-2xl mt-2">No encontramos ese vino</p>
            <p className="text-sm font-semibold opacity-70">Prueba con “corozo” o limpia los filtros.</p>
            <button onClick={() => { setBusqueda(""); setFiltroCat("Todas"); setSoloOfertas(false); }} className="btn-relieve btn-dorado px-5 py-2.5 mt-4 text-sm cursor-pointer">Ver todo</button>
          </div>
        ) : (
          <>
            {combosFiltrados.length > 0 ? (
              <section id="combos" className="relieve overflow-hidden reveal scroll-mt-28">
                <div className="cenefa" />
                <div className="hero-vino filigrana px-5 sm:px-7 py-7">
                  <div className="flex flex-wrap items-end justify-between gap-2 mb-5">
                    <div>
                      <p className="text-[11px] font-extrabold tracking-[0.25em]" style={{ color: "#f0d48a" }}>— PARA COMPARTIR —</p>
                      <h2 className="font-display font-black text-3xl sm:text-4xl" style={{ color: "#fff8ea" }}>🎁 Combos que <span className="italic gold-text">enamoran</span></h2>
                    </div>
                    <span className="etiqueta" style={{ background: "#f0d48a" }}>{combosFiltrados.length} combos</span>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {combosFiltrados.map((p, i) => (
                      <ProductCard key={p.id} p={p} index={i} qty={cart[p.id] || 0}
                        onAdd={() => addToCart(p.id, 1)} onMore={() => addToCart(p.id, 1)} onLess={() => addToCart(p.id, -1)} />
                    ))}
                  </div>
                </div>
                <div className="cenefa" />
              </section>
            ) : null}

            <section className="flex flex-col gap-4">
              <div className="reveal flex items-end justify-between flex-wrap gap-2">
                <div>
                  <p className="text-[11px] font-extrabold tracking-[0.25em]" style={{ color: "#b3402a" }}>— LA VITRINA —</p>
                  <h2 className="font-display font-black text-3xl sm:text-4xl" style={{ color: "#4a0f1a" }}>Nuestros vinos <span className="italic" style={{ color: "#b3402a" }}>artesanales</span></h2>
                </div>
                <span className="text-xs font-extrabold px-3 py-1.5 rounded-full" style={{ background: "#fff", border: "2px solid rgba(61,43,31,0.4)" }}>{sencillos.length} vinos · {ofertas} en oferta 🔥</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sencillos.map((p, i) => (
                  <ProductCard key={p.id} p={p} index={i} qty={cart[p.id] || 0}
                    onAdd={() => addToCart(p.id, 1)} onMore={() => addToCart(p.id, 1)} onLess={() => addToCart(p.id, -1)} />
                ))}
              </div>
            </section>
          </>
        )}

        {/* Historia */}
        <section id="historia" className="relieve overflow-hidden reveal scroll-mt-28">
          <div className="cenefa" />
          <div className="p-6 sm:p-9" style={{ background: "linear-gradient(180deg,#fffdf6,#f7ead0)" }}>
            <p className="reveal text-[11px] font-extrabold tracking-[0.25em] text-center" style={{ color: "#b3402a" }}>— DESDE SANTA CRUZ DE MOMPOX —</p>
            <h2 className="reveal font-display font-black text-3xl sm:text-[42px] text-center leading-tight" style={{ color: "#4a0f1a" }}>
              Del patio Caribe,<br className="sm:hidden" /> <span className="italic" style={{ color: "#b3402a" }}>directo a tu mesa.</span>
            </h2>
            <div className="mt-7 grid md:grid-cols-3 gap-4">
              {[
                { icon: <Grape size={24} color="#7a1e2b" />, bg: "#f7dfe2", t: "🌴 De la fruta al vino", d: "Corozo, mango, mamón, ciruela y maracuyá en lotes pequeños. Sin afanes, como se hace todo en Mompox." },
                { icon: <Landmark size={24} color="#8a5a33" />, bg: "#f7ead0", t: "🏺 Receta de la casa", d: "Dulces, aromáticos y de cuerpo vivo. Cada cosecha cambia un poco — esa es la gracia de lo artesanal." },
                { icon: <HandHeart size={24} color="#2e6b4f" />, bg: "#ddf0da", t: "🤝 Compra directa", d: "Lo que pides aquí entra al cuaderno del patrón: se descuenta del stock y te hablamos por WhatsApp." },
              ].map((c, i) => (
                <div key={i} className={`reveal stagger-${i + 1} relieve-suave p-5 card-vino`}>
                  <span className="w-12 h-12 flex items-center justify-center rounded-2xl mb-3" style={{ background: c.bg, border: "2px solid #3d2b1f", boxShadow: "2px 2px 0 #3d2b1f" }}>{c.icon}</span>
                  <p className="font-display font-bold text-xl">{c.t}</p>
                  <p className="text-[13.5px] font-medium opacity-75 leading-relaxed mt-1">{c.d}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="cenefa" />
        </section>

        {/* Opiniones */}
        <section id="opiniones" className="flex flex-col gap-4 reveal scroll-mt-28">
          <h2 className="font-display font-black text-3xl text-center" style={{ color: "#4a0f1a" }}>Lo que dice <span className="italic" style={{ color: "#b3402a" }}>el pueblo</span> 🗣️</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              ["Doña Carmen", "Mompox", "“El de corozo es el mejor que he probado. Dulce justo, no empalaga. Pedí 6 y volaron.”"],
              ["Jairo P.", "Magangué", "“Pedí por WhatsApp un viernes y el sábado ya estaba brindando. El combo fiesta rinde muchísimo.”"],
              ["Luisa F.", "Cartagena", "“El de mango huele a Caribe puro. La botella llegó bien empacada y con nota escrita a mano.”"],
            ].map(([n, c, t], i) => (
              <figure key={i} className={`reveal stagger-${i + 1} relieve-suave p-5 card-vino relative`}>
                <span className="font-display text-5xl absolute top-2 right-4 opacity-20">“</span>
                <div className="flex gap-1 mb-2">{[0, 1, 2, 3, 4].map((s) => <Star key={s} size={14} fill="#c99a2b" color="#c99a2b" />)}</div>
                <blockquote className="text-[13.5px] font-semibold leading-relaxed">{t}</blockquote>
                <figcaption className="mt-3 text-xs font-extrabold uppercase tracking-wider opacity-70">— {n} · {c}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Cómo pedir */}
        <section id="pedido" className="relieve-suave p-6 sm:p-7 reveal scroll-mt-28" style={{ background: "linear-gradient(180deg,#fffdf6,#faf0d8)" }}>
          <h2 className="font-display font-black text-3xl sm:text-4xl mb-1 text-center" style={{ color: "#4a0f1a" }}>Pedir es <span className="italic" style={{ color: "#b3402a" }}>facilito</span> 🧾</h2>
          <p className="text-sm font-semibold opacity-70 mb-5 text-center max-w-2xl mx-auto">Sin registro obligatorio, sin enredos. Como pedirle al vecino. {fbUser ? "🔑 Entraste con Google: tu canasta se guarda en la nube." : "💡 Si entras con Google, tu canasta te sigue en cualquier dispositivo."}</p>
          <ol className="grid sm:grid-cols-3 gap-3">
            {[
              { n: "1", t: "Arma tu canasta 🧺", d: "Agrega vinos y combos. Todo se guarda solo." },
              { n: "2", t: "Datos de entrega", d: "Nombre, WhatsApp y dirección. Elige tu pago." },
              { n: "3", t: "Confirma por WhatsApp", d: "Se abre el chat con tu pedido listo." },
            ].map((s, i) => (
              <li key={i} className={`reveal stagger-${i + 1} relieve-hundido px-4 py-4 relative overflow-hidden`}>
                <span className="font-display font-black text-5xl absolute -top-1 right-2 opacity-15">{s.n}</span>
                <p className="font-extrabold text-[15px] relative">{s.n} · {s.t}</p>
                <p className="text-[13px] font-medium opacity-70 relative">{s.d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-3 items-center justify-center">
            <button onClick={() => setCartOpen(true)} className="btn-relieve btn-vino btn-shine px-7 py-3.5 text-[15px] cursor-pointer flex items-center gap-2 font-extrabold">
              <ShoppingBasket size={17} /> Abrir mi canasta ({cartCount})
            </button>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hola 🍷 quiero info de los Vinos Mompox")}`} target="_blank" rel="noreferrer"
              className="btn-relieve btn-palma px-7 py-3.5 text-[15px] cursor-pointer flex items-center gap-2 font-extrabold">
              <MessageCircle size={17} /> Hablar por WhatsApp
            </a>
          </div>
        </section>
      </div>

      {/* Footer premium */}
      <footer className="mt-6" style={{ background: "#22060d", borderTop: "2px solid #3d2b1f" }}>
        <div className="cenefa" />
        <div className="max-w-6xl mx-auto px-5 py-10 grid md:grid-cols-3 gap-8">
          <div>
            <p className="flex items-center gap-3">
              <span className="inline-flex items-center px-3 py-1.5" style={{ background: "#fffdf6", border: "2px solid #3d2b1f", borderRadius: "1rem" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-vino-mompox.png" alt="Vino Mompox" className="h-11 w-auto" />
              </span>
            </p>
            <p className="text-[13px] font-medium mt-2 leading-relaxed" style={{ color: "#cbb98f" }}>
              Vinos artesanales de Corozo, Mango, Mamón, Ciruela y Maracuyá. Fermentados en pequeños lotes en Santa Cruz de Mompox, Bolívar.
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: "#f0d48a" }}><MapPin size={14} /> Mompox · Bolívar · Caribe colombiano</p>
          </div>
          <div className="text-[13px] font-semibold" style={{ color: "#cbb98f" }}>
            <p className="font-display font-bold text-lg mb-2" style={{ color: "#fff8ea" }}>Atajos</p>
            <p className="flex flex-col gap-1.5">
              <a href="#catalogo" className="hover:text-[#ffe9a8]">🍷 Ver vinos</a>
              <a href="#combos" className="hover:text-[#ffe9a8]">🎁 Combos</a>
              <a href="#historia" className="hover:text-[#ffe9a8]">🏺 Historia</a>
              <a href="#pedido" className="hover:text-[#ffe9a8]">🧾 Cómo pedir</a>
            </p>
          </div>
          <div className="text-[13px] font-semibold" style={{ color: "#cbb98f" }}>
            <p className="font-display font-bold text-lg mb-2" style={{ color: "#fff8ea" }}>Pagos y contacto</p>
            <p>💳 {METODOS_PAGO.join(" · ")}</p>
            <p className="mt-1 flex items-center gap-1.5"><Phone size={14} color="#f0d48a" /> Pedidos por WhatsApp</p>
            <p className="mt-1 flex items-center gap-1.5"><Truck size={14} color="#f0d48a" /> Entrega coordinada</p>
          </div>
        </div>
        <div className="text-center text-[11.5px] font-semibold pb-6 px-4 flex flex-col gap-1" style={{ color: "#8a7a5a" }}>
          <span>Hecho a mano en Santa Cruz de Mompox · Vino Mompox 🍷</span>
          <span>El exceso de alcohol es perjudicial para la salud · Prohíbese la venta a menores de edad</span>
        </div>
      </footer>

      {/* Flotantes */}
      {cartCount > 0 && !cartOpen ? (
        <button onClick={() => setCartOpen(true)}
          className="btn-relieve btn-vino btn-shine fixed bottom-5 right-5 z-40 px-5 py-3.5 text-sm cursor-pointer flex items-center gap-2 anim-pop">
          <ShoppingBasket size={18} /> {cartCount} · {formatCOP(total)} <ChevronRight size={15} />
        </button>
      ) : (
        <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hola 🍷 quiero info de los Vinos Mompox")}`} target="_blank" rel="noreferrer"
          className="btn-relieve fixed bottom-5 right-5 z-40 w-13 h-13 p-3.5 cursor-pointer flex items-center justify-center"
          style={{ background: "#25d366", borderRadius: "999px", width: "52px", height: "52px" }} aria-label="WhatsApp">
          <MessageCircle size={22} color="#fff" />
        </a>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)}
        cart={cart} productos={productos}
        onMore={(id) => addToCart(id, 1)} onLess={(id) => addToCart(id, -1)}
        onRemove={removeFromCart} onClear={() => setCart({})}
        subtotal={subtotal} envio={envio} total={total} zona={zonaEfectiva} msgZona={msgZona} sugerenciasCiudad={sugerenciasCiudad}
        form={form} setForm={setForm} pago={pago} setPago={setPago}
        enviando={enviando} error={error} okMsg={okMsg} onPedir={onPedir} payuEnv={payuEnv} mpEnv={mpEnv} />
    </div>
  );
}
