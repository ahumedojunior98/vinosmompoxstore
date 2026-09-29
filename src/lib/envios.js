// Zonas de envío — espejo del admin (solo lectura + cálculo en la tienda).
// Colección `shipping_zones`: { nombre, valor, activa, gratisDesde, orden }
// Órdenes guardan: shipping: { zoneId, zoneName, cost }, shippingCost, subtotal, total.
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";

export const ZONAS_COLLECTION = "shipping_zones";

export function subscribeZonas(callback, onError) {
  let unsub = null;
  try {
    const q = query(collection(db, ZONAS_COLLECTION), orderBy("orden", "asc"));
    unsub = onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {
        unsub && unsub();
        unsub = onSnapshot(
          collection(db, ZONAS_COLLECTION),
          (snap2) => {
            const items = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
            items.sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
            callback(items);
          },
          (e2) => onError && onError(e2)
        );
      }
    );
  } catch {
    unsub = onSnapshot(
      collection(db, ZONAS_COLLECTION),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => onError && onError(e)
    );
  }
  return () => unsub && unsub();
}

export function zonasActivas(zonas) {
  return (zonas || []).filter((z) => z.activa !== false);
}

export function calcularEnvio(zona, subtotal) {
  if (!zona) return 0;
  const valor = Math.max(0, Math.round(Number(zona.valor) || 0));
  const gratisDesde = Math.max(0, Math.round(Number(zona.gratisDesde) || 0));
  if (gratisDesde > 0 && Number(subtotal) >= gratisDesde) return 0;
  return valor;
}

export function zonaPorId(zonas, id) {
  return (zonas || []).find((z) => z.id === id) || null;
}

// 32 departamentos de Colombia (lista curada, sin APIs externas).
export const DEPARTAMENTOS = [
  "Amazonas", "Antioquia", "Arauca", "Atlántico", "Bolívar", "Boyacá",
  "Caldas", "Caquetá", "Casanare", "Cauca", "Cesar", "Chocó",
  "Córdoba", "Cundinamarca", "Guainía", "Guaviare", "Huila", "La Guajira",
  "Magdalena", "Meta", "Nariño", "Norte de Santander", "Putumayo", "Quindío",
  "Risaralda", "San Andrés y Providencia", "Santander", "Sucre", "Tolima",
  "Valle del Cauca", "Vaupés", "Vichada",
];

// Ciudad → departamento (claves normalizadas, sin tildes).
export const DEPTO_POR_CIUDAD = {
  barranquilla: "Atlántico",
  soledad: "Atlántico",
  "puerto colombia": "Atlántico",
  malambo: "Atlántico",
  cartagena: "Bolívar",
  mompox: "Bolívar",
  "santa marta": "Magdalena",
  bogota: "Cundinamarca",
  cali: "Valle del Cauca",
  medellin: "Antioquia",
  bucaramanga: "Santander",
  "florida blanca": "Santander",
  floridablanca: "Santander",
  piedecuesta: "Santander",
};

export function deptoDeCiudad(ciudad) {
  return DEPTO_POR_CIUDAD[normalizarTexto(ciudad)] || "";
}

// Normaliza texto para comparar: minúsculas + sin tildes + espacios simples.
export function normalizarTexto(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function palabrasClaveZona(z) {
  const deCiudades = Array.isArray(z.ciudades) ? z.ciudades : [];
  const claves = deCiudades.map(normalizarTexto).filter(Boolean);
  if (claves.length === 0 && z.nombre) {
    // Fallback: usa el nombre de la zona (ej: "Mompox")
    const n = normalizarTexto(z.nombre);
    if (n.length >= 4) claves.push(n);
  }
  return [...new Set(claves)];
}

// Destinos de la zona normalizados: [{ ciudad, valor }]
export function destinosZona(z) {
  const arr = Array.isArray(z?.destinos) ? z.destinos : [];
  const salen = [];
  for (const d of arr) {
    const ciudad = normalizarTexto(d?.ciudad || "");
    if (ciudad.length < 4) continue;
    salen.push({ ciudad, valor: Math.max(0, Math.round(Number(d?.valor) || 0)) });
  }
  return salen;
}

// Precio aplicable de una zona para una dirección: destino con precio propio
// si coincide, si no el valor base. Devuelve { precio, match, esDestino }.
export function precioZonaPara(zona, direccion) {
  const base = Math.max(0, Math.round(Number(zona?.valor) || 0));
  const texto = normalizarTexto(direccion);
  if (texto.length < 3) return { precio: base, match: null, esDestino: false };
  let mejor = null;
  for (const d of destinosZona(zona)) {
    if (texto.includes(d.ciudad) && (!mejor || d.ciudad.length > mejor.ciudad.length)) mejor = d;
  }
  if (mejor) return { precio: mejor.valor, match: mejor.ciudad, esDestino: true };
  return { precio: base, match: null, esDestino: false };
}

// Autodetecta la zona desde la dirección escrita por el cliente.
// Devuelve { zona, match, precio, esDestino } o null.
// Prioridad: destinos con precio propio (más específicos) > keywords de zona.
export function detectarZona(zonas, direccion) {
  const texto = normalizarTexto(direccion);
  if (texto.length < 3) return null;
  let mejorDestino = null;
  let mejorZona = null;
  for (const z of zonas || []) {
    if (z.activa === false) continue;
    for (const d of destinosZona(z)) {
      if (texto.includes(d.ciudad) && (!mejorDestino || d.ciudad.length > mejorDestino.ciudad.length)) {
        mejorDestino = { zona: z, match: d.ciudad, precio: d.valor };
      }
    }
    if (!mejorDestino) {
      for (const clave of palabrasClaveZona(z)) {
        if (clave.length >= 4 && texto.includes(clave) && (!mejorZona || clave.length > mejorZona.match.length)) {
          mejorZona = { zona: z, match: clave };
        }
      }
    }
  }
  if (mejorDestino) return { ...mejorDestino, esDestino: true };
  if (mejorZona) {
    const base = Math.max(0, Math.round(Number(mejorZona.zona.valor) || 0));
    return { zona: mejorZona.zona, match: mejorZona.match, precio: base, esDestino: false };
  }
  return null;
}
