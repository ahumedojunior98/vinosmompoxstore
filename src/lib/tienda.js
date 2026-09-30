// Lectura pública del catálogo + creación de pedidos.
// Schema espejo de vinomompox-admin-dashboard/src/lib/store.js
// products: { name, category, price, stock, description, imageUrl, discount, type: sencillo|combo, comboItems: [{id,name,qty,price}], active, createdAt, updatedAt }
// orders: { customer:{name,phone,address}, items:[{productId,name,qty,unitPrice}], subtotal, discount, total, payment, notes, status, createdAt, updatedAt }
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  increment,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export const CATEGORIAS = [
  "Vino de Corozo",
  "Vino de Mango",
  "Vino de Mamón",
  "Vino de Ciruela",
  "Vino de Maracuyá",
  "Combo Promocional",
  "Otro",
];

export const METODOS_PAGO = ["Mercado Pago", "Nequi", "Efectivo", "Transferencia", "Daviplata", "Otro"];

// Método de pago en línea (Checkout Pro). Lo demás sigue por WhatsApp.
export const PAGO_MP = "Mercado Pago";

// Cambia este número por tu WhatsApp real (código país + número, sin + ni espacios)
export const WHATSAPP_NUMBER = "573177764722";

const COLLECTION = "products";
const ORDERS = "orders";

export function subscribeCatalogo(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.active !== false);
      callback(items);
    },
    (err) => {
      // Fallback sin orderBy (docs viejos sin createdAt o sin índice)
      const fallback = onSnapshot(
        collection(db, COLLECTION),
        (snap2) =>
          callback(
            snap2.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((p) => p.active !== false)
          ),
        (e2) => onError && onError(e2)
      );
      return fallback;
    }
  );
}

export async function crearPedido({ customer, items, payment, notes, consentimientos = null, uid = null, userEmail = "", shipping = null }) {
  const limpios = (items || [])
    .filter((i) => i.productId && (Number(i.qty) || 0) > 0)
    .map((i) => ({
      productId: i.productId,
      name: String(i.name || ""),
      qty: Number(i.qty),
      unitPrice: Number(i.unitPrice) || 0,
    }));
  if (limpios.length === 0) throw new Error("Tu canasta está vacía.");
  if (!customer?.name?.trim()) throw new Error("Cuéntanos tu nombre para el pedido.");
  if (!customer?.phone?.trim()) throw new Error("Déjanos tu teléfono / WhatsApp para coordinar la entrega.");
  if (!customer?.address?.trim()) throw new Error("Indícanos la dirección de entrega.");
  if (!customer?.ciudad?.trim()) throw new Error("Indícanos la ciudad.");
  if (!customer?.depto?.trim()) throw new Error("Indícanos el departamento.");
  if (!consentimientos?.datos || !consentimientos?.mayorEdad) {
    throw new Error("Acepta el tratamiento de datos y confirma que tienes 18 años o más.");
  }

  const subtotal = limpios.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const envio = Math.max(0, Math.round(Number(shipping?.cost) || 0));
  const total = subtotal + envio;

  const batch = writeBatch(db);
  const orderRef = doc(collection(db, ORDERS));
  batch.set(orderRef, {
    customer: {
      name: customer.name.trim(),
      phone: String(customer.phone || "").trim(),
      address: String(customer.address || "").trim(),
      ciudad: String(customer.ciudad || "").trim(),
      depto: String(customer.depto || "").trim(),
    },
    items: limpios,
    subtotal,
    discount: 0,
    shipping: {
      zoneId: String(shipping?.zoneId || ""),
      zoneName: String(shipping?.zoneName || ""),
      cost: envio,
    },
    shippingCost: envio,
    total,
    payment: payment || "Nequi",
    notes: String(notes || "").trim(),
    status: "pendiente",
    origen: "tienda-web",
    // Prueba de consentimiento (Ley 1581 + Ley 124): datos + 18 años.
    consentimientos: {
      datos: true,
      mayorEdad: true,
      fecha: String(consentimientos?.fecha || new Date().toISOString()),
    },
    // Trazabilidad del usuario (null si pidió como invitado)
    uid: uid || null,
    userEmail: String(userEmail || ""),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  for (const i of limpios) {
    batch.update(doc(db, COLLECTION, i.productId), {
      stock: increment(-i.qty),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return orderRef.id;
}

export function mensajeWhatsApp({ customer, items, subtotal, total, shipping, payment, pedidoId }) {
  const lineas = items.map((i) => `• ${i.qty}x ${i.name} — $${(i.unitPrice * i.qty).toLocaleString("es-CO")}`);
  const base = subtotal ?? total;
  return encodeURIComponent(
    `🍷 *NUEVO PEDIDO · VINO MOMPOX* 🍷\n` +
      `Pedido: ${pedidoId || ""}\n` +
      `———————————\n` +
      `${lineas.join("\n")}\n` +
      `———————————\n` +
      `Subtotal: $${Number(base).toLocaleString("es-CO")}\n` +
      (shipping && (shipping.cost > 0 || shipping.zoneName)
        ? `Envío${shipping.zoneName ? ` (${shipping.zoneName})` : ""}: $${Number(shipping.cost || 0).toLocaleString("es-CO")}\n`
        : "") +
      `Total: $${Number(total).toLocaleString("es-CO")} (${payment})\n` +
      `Nombre: ${customer.name}\n` +
      `Tel: ${customer.phone}\n` +
      `Dirección: ${customer.address}\n` +
      `Ciudad: ${customer.ciudad || ""}\n` +
      `Depto: ${customer.depto || ""}` +
      (customer.notes ? `\nNota: ${customer.notes}` : "")
  );
}
