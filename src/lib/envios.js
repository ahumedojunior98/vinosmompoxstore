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
