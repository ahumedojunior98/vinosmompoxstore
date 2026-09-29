// Consentimiento de cookies y analítica con opt-in (privacidad por defecto).
// Sin aceptación, NO se carga ni se envía nada de analítica.
export const CONSENT_KEY = "vm-consentimiento";
export const EDAD_KEY = "vm-edad-ok";

export function leerConsentimiento() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return typeof data?.analitica === "boolean" ? data : null;
  } catch {
    return null;
  }
}

export function guardarConsentimiento(analitica) {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ analitica: !!analitica, fecha: new Date().toISOString() }));
  } catch {
    /* sin storage */
  }
  aplicarAnalitica();
}

function gaId() {
  return (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_GA_ID) || "";
}

// Carga GA4 solo con consentimiento + ID configurado. Sin ID, no hace nada.
export function aplicarAnalitica() {
  try {
    const c = leerConsentimiento();
    const id = gaId();
    if (!c?.analitica || !id || typeof document === "undefined") return false;
    if (document.querySelector('script[data-vm-ga]')) return true;
    const s = document.createElement("script");
    s.async = true;
    s.setAttribute("data-vm-ga", "1");
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id, { anonymize_ip: true });
    return true;
  } catch {
    return false;
  }
}

// Evento de analítica: solo sale con consentimiento + GA configurado.
export function track(evento, datos) {
  try {
    const c = leerConsentimiento();
    if (!c?.analitica || !gaId() || typeof window === "undefined" || !window.gtag) return false;
    window.gtag("event", String(evento || "evento"), datos || {});
    return true;
  } catch {
    return false;
  }
}

export function esMayorEdad() {
  try {
    return localStorage.getItem(EDAD_KEY) === "1";
  } catch {
    return false;
  }
}

export function guardarMayorEdad() {
  try {
    localStorage.setItem(EDAD_KEY, "1");
  } catch {
    /* sin storage */
  }
}
