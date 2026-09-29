import { NextResponse } from "next/server";
import { collection, addDoc, getDoc, doc, getDocs, query, where, limit, serverTimestamp, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { precioFinal } from "@/lib/utils";
import { MP_CURRENCY, esEmailValidoMp, generarReferenciaMp } from "@/lib/mp";
import { crearPreferencia, getMpConfigServer, logMp } from "@/lib/mp-server";

export const runtime = "nodejs";

const ORDERS = "orders";
const PRODUCTS = "products";
const MAX_LINEAS = 20;
const MAX_QTY = 99;

function error(status, mensaje, extra = {}) {
  return NextResponse.json({ ok: false, error: mensaje, ...extra }, { status });
}

// POST /api/mp/crear-preferencia
// Crea la orden interna en pending (total calculado en servidor desde
// Firestore; precios del cliente se IGNORAN) y luego crea la preferencia
// Checkout Pro en Mercado Pago. Devuelve init_point para redirigir.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error(400, "Cuerpo JSON inválido.");
  }

  const customer = body.customer || {};
  const nombre = String(customer.name || "").trim();
  const telefono = String(customer.phone || "").trim();
  const direccion = String(customer.address || "").trim();
  const ciudad = String(customer.ciudad || "").trim().slice(0, 80);
  const depto = String(customer.depto || "").trim().slice(0, 80);
  const email = String(customer.email || "").trim().toLowerCase();
  const notes = String(body.notes || "").trim().slice(0, 500);
  const uid = body.uid || null;
  const userEmail = String(body.userEmail || "").trim();
  const itemsRaw = Array.isArray(body.items) ? body.items : [];

  if (!nombre) return error(400, "Falta el nombre del cliente.");
  if (!telefono) return error(400, "Falta el teléfono / WhatsApp.");
  if (!direccion) return error(400, "Falta la dirección de entrega.");
  if (!ciudad) return error(400, "Falta la ciudad.");
  if (!depto) return error(400, "Falta el departamento.");
  if (!esEmailValidoMp(email)) return error(400, "Se necesita un correo válido para pagar con Mercado Pago.");
  if (itemsRaw.length === 0) return error(400, "La canasta está vacía.");
  if (itemsRaw.length > MAX_LINEAS) return error(400, "Demasiadas líneas en la orden.");

  const pedidos = [];
  for (const it of itemsRaw) {
    const productId = String(it?.productId || "").trim();
    const qty = Math.floor(Number(it?.qty) || 0);
    if (!productId || productId.length > 100 || productId.includes("/")) {
      return error(400, "Hay un producto con identificador inválido.");
    }
    if (qty < 1 || qty > MAX_QTY) return error(400, `Cantidad inválida para ${productId}.`);
    const previo = pedidos.find((p) => p.productId === productId);
    if (previo) previo.qty += qty;
    else pedidos.push({ productId, qty });
  }

  const items = [];
  try {
    for (const p of pedidos) {
      const snap = await getDoc(doc(db, PRODUCTS, p.productId));
      if (!snap.exists()) return error(400, `El producto ya no existe (${p.productId}).`);
      const prod = snap.data() || {};
      if (prod.active === false) return error(400, `«${prod.name || "Producto"}» está pausado.`);
      const stock = Number(prod.stock) || 0;
      if (prod.type !== "combo" && p.qty > stock) {
        return error(400, `Solo quedan ${stock} de «${prod.name}».`);
      }
      items.push({
        productId: p.productId,
        name: String(prod.name || "Vino"),
        qty: p.qty,
        unitPrice: precioFinal(prod),
        descontarStock: prod.type !== "combo",
      });
    }
  } catch (e) {
    logMp("crear-preferencia: error leyendo productos", e?.message || e);
    return error(500, "No pude verificar los productos. Intenta de nuevo.");
  }

  const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);

  // Envío: se recalcula en servidor desde shipping_zones (el cliente solo manda el id).
  const shippingZoneId = String(body.shippingZoneId || "").trim().slice(0, 100);
  let shipping = { zoneId: "", zoneName: "", cost: 0 };
  if (!shippingZoneId) return error(400, "Elige tu zona de envío.");
  try {
    const zSnap = await getDoc(doc(db, "shipping_zones", shippingZoneId));
    if (!zSnap.exists()) return error(400, "La zona de envío ya no existe. Elige otra.");
    const z = zSnap.data() || {};
    if (z.activa === false) return error(400, `La zona «${z.nombre || "envío"}» está pausada. Elige otra.`);
    // Precio con destino: si la dirección coincide con una ruta con precio propio,
    // se usa ese valor (igual que la tienda). Nunca el costo del cliente.
    const { precioZonaPara } = await import("@/lib/envios");
    const det = precioZonaPara({ ...z, id: zSnap.id }, `${direccion} ${ciudad} ${depto}`);
    const valor = Math.max(0, Math.round(Number(det.precio) || 0));
    const gratisDesde = Math.max(0, Math.round(Number(z.gratisDesde) || 0));
    const cost = gratisDesde > 0 && subtotal >= gratisDesde ? 0 : valor;
    shipping = { zoneId: zSnap.id, zoneName: String(z.nombre || ""), cost };
  } catch (e) {
    logMp("crear-preferencia: error leyendo zona", e?.message || e);
    return error(500, "No pude verificar la zona de envío. Intenta de nuevo.");
  }

  const total = Math.round(subtotal) + shipping.cost;
  if (total < 1000) return error(400, "El total mínimo para Mercado Pago es $1.000 COP.");

  let cfg;
  try {
    cfg = getMpConfigServer();
  } catch (e) {
    if (e.code === "MP_SIN_CREDENCIALES") return error(500, "Mercado Pago no está configurado en el servidor.");
    if (e.code === "MP_ENV_CONFLICTO" || e.code === "MP_TOKEN_PRUEBA_EN_PRODUCCION" || e.code === "MP_TOKEN_PROD_EN_SANDBOX" || e.code === "MP_URL_BASE_INVALIDA") {
      logMp("crear-preferencia: configuración MP inválida", e.code);
      return error(500, "Mercado Pago está mal configurado en el servidor. Intenta más tarde.");
    }
    throw e;
  }
  if (!cfg.appUrl) return error(500, "Falta la URL base de la tienda en el servidor (MP_APP_URL).");

  let reference = "";
  try {
    for (let intento = 0; intento < 3; intento++) {
      const cand = generarReferenciaMp();
      const q = query(collection(db, ORDERS), where("referenciaMP", "==", cand), limit(1));
      const existe = await getDocs(q);
      if (existe.empty) {
        reference = cand;
        break;
      }
    }
  } catch (e) {
    logMp("crear-preferencia: error generando referencia", e?.message || e);
    return error(500, "No pude iniciar el pago. Intenta de nuevo.");
  }
  if (!reference) return error(500, "No pude generar una referencia única. Intenta de nuevo.");

  const botellas = items.reduce((a, i) => a + i.qty, 0);
  let orderId;
  try {
    const ref = await addDoc(collection(db, ORDERS), {
      referenciaMP: reference,
      customer: { name: nombre, phone: telefono, address: direccion, ciudad, depto, email },
      items,
      subtotal,
      discount: 0,
      shipping,
      shippingCost: shipping.cost,
      total,
      payment: "Mercado Pago",
      paymentState: "pending",
      notes,
      status: "pendiente",
      uid: uid || null,
      userEmail: userEmail || "",
      origen: "tienda-mp",
      mp: {
        env: cfg.env,
        currency: cfg.currency || MP_CURRENCY,
        preferenceId: null,
        paymentId: null,
        paymentStatus: null,
        paymentMethod: null,
        processedPayments: [],
        stockDescontado: false,
        history: [{ at: new Date().toISOString(), from: null, to: "pending", detalle: "Orden creada, esperando pago" }],
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    orderId = ref.id;
  } catch (e) {
    logMp("crear-preferencia: error guardando", reference, e?.message || e);
    return error(500, "No pude crear la orden. Intenta de nuevo.");
  }

  // Preferencia en MP (red: puede fallar → la orden queda en error, la canasta intacta).
  // El envío viaja como ítem propio para que MP cobre subtotal + envío.
  try {
    const itemsMp = shipping.cost > 0
      ? [...items, { name: `Envío — ${shipping.zoneName || "zona"}`, qty: 1, unitPrice: shipping.cost }]
      : items;
    const { preferenceId, initPoint } = await crearPreferencia({
      items: itemsMp,
      payerEmail: email,
      reference,
      description: `Vino Mompox · ${botellas} botella(s) · ${reference} · envío ${shipping.zoneName || ""}`.slice(0, 255),
    });
    try {
      await updateDoc(doc(db, ORDERS, orderId), {
        "mp.preferenceId": preferenceId,
        "mp.initPoint": initPoint,
        "mp.history": arrayUnion({ at: new Date().toISOString(), from: "pending", to: "pending", detalle: `Preferencia MP ${preferenceId}` }),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      logMp("crear-preferencia: no pude guardar preferenceId", reference, e?.message || e);
    }
    logMp("preferencia creada", reference, `env=${cfg.env}`, `total=${total}`, `pref=${preferenceId}`);
    return NextResponse.json({ ok: true, orderId, reference, total, subtotal, shipping, currency: cfg.currency || MP_CURRENCY, env: cfg.env, preferenceId, initPoint });
  } catch (e) {
    logMp("crear-preferencia: MP falló", reference, e?.code || e?.message || e);
    try {
      await updateDoc(doc(db, ORDERS, orderId), {
        paymentState: "error",
        "mp.history": arrayUnion({ at: new Date().toISOString(), from: "pending", to: "error", detalle: `MP no disponible (${e?.code || "error"})` }),
        updatedAt: serverTimestamp(),
      });
    } catch { /* nada */ }
    return error(502, "Mercado Pago no respondió. Intenta de nuevo.");
  }
}
