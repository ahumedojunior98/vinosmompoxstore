import { NextResponse } from "next/server";
import { collection, addDoc, getDoc, doc, getDocs, query, where, limit, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { precioFinal } from "@/lib/utils";
import { generarReferencia, esEmailValido, PAYU_CURRENCY } from "@/lib/payu";
import { firmaCheckout, getPayuConfigServer, logPayu } from "@/lib/payu-server";

export const runtime = "nodejs";

const ORDERS = "orders";
const PRODUCTS = "products";
const MAX_LINEAS = 20;
const MAX_QTY = 99;

function error(status, mensaje, extra = {}) {
  return NextResponse.json({ ok: false, error: mensaje, ...extra }, { status });
}

// POST /api/payu/crear-orden
// Crea la orden interna en estado pending con referencia única y devuelve
// los datos del formulario WebCheckout ya firmados.
// El TOTAL se calcula en el servidor desde Firestore (precios confiables);
// cualquier precio/total enviado por el cliente se IGNORA.
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
  const email = String(customer.email || "").trim().toLowerCase();
  const notes = String(body.notes || "").trim().slice(0, 500);
  const uid = body.uid || null;
  const userEmail = String(body.userEmail || "").trim();
  const preview = body.preview === true;
  const itemsRaw = Array.isArray(body.items) ? body.items : [];

  if (!nombre) return error(400, "Falta el nombre del cliente.");
  if (!telefono) return error(400, "Falta el teléfono / WhatsApp.");
  if (!direccion) return error(400, "Falta la dirección de entrega.");
  if (!esEmailValido(email)) return error(400, "Se necesita un correo válido para pagar con PayU.");
  if (itemsRaw.length === 0) return error(400, "La canasta está vacía.");
  if (itemsRaw.length > MAX_LINEAS) return error(400, "Demasiadas líneas en la orden.");

  // Normaliza: solo importan productId + qty. Precios del cliente se ignoran.
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

  // Precios CONFIABLES desde Firestore (fuente de verdad, no el cliente)
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
      const unitPrice = precioFinal(prod);
      items.push({
        productId: p.productId,
        name: String(prod.name || "Vino"),
        qty: p.qty,
        unitPrice,
        // Los combos no son inventario físico: el stock se descuenta solo de vinos.
        descontarStock: prod.type !== "combo",
      });
    }
  } catch (e) {
    logPayu("crear-orden: error leyendo productos", e?.message || e);
    return error(500, "No pude verificar los productos. Intenta de nuevo.");
  }

  const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);

  // Envío recalculado en servidor desde shipping_zones.
  const shippingZoneId = String(body.shippingZoneId || "").trim().slice(0, 100);
  let shipping = { zoneId: "", zoneName: "", cost: 0 };
  if (!shippingZoneId) return error(400, "Elige tu zona de envío.");
  try {
    const zSnap = await getDoc(doc(db, "shipping_zones", shippingZoneId));
    if (!zSnap.exists()) return error(400, "La zona de envío ya no existe. Elige otra.");
    const z = zSnap.data() || {};
    if (z.activa === false) return error(400, `La zona «${z.nombre || "envío"}» está pausada. Elige otra.`);
    const valor = Math.max(0, Math.round(Number(z.valor) || 0));
    const gratisDesde = Math.max(0, Math.round(Number(z.gratisDesde) || 0));
    const cost = gratisDesde > 0 && subtotal >= gratisDesde ? 0 : valor;
    shipping = { zoneId: zSnap.id, zoneName: String(z.nombre || ""), cost };
  } catch (e) {
    logPayu("crear-orden: error leyendo zona", e?.message || e);
    return error(500, "No pude verificar la zona de envío. Intenta de nuevo.");
  }

  const total = Math.round(subtotal) + shipping.cost;
  if (total < 1000) return error(400, "El total mínimo para PayU es $1.000 COP.");

  let cfg;
  try {
    cfg = getPayuConfigServer();
  } catch (e) {
    if (e.code === "PAYU_SIN_CREDENCIALES") return error(500, "PayU no está configurado en el servidor.");
    // Mezcla sandbox/producción, credencial de prueba en prod o URL base inválida:
    // fallar rápido y visible en vez de cobrar (o no cobrar) en el ambiente equivocado.
    if (e.code === "PAYU_ENV_CONFLICTO" || e.code === "PAYU_CREDENCIAL_PRUEBA_EN_PRODUCCION" || e.code === "PAYU_URL_BASE_INVALIDA") {
      logPayu("crear-orden: configuración PayU inválida", e.code);
      return error(500, "PayU está mal configurado en el servidor. Intenta más tarde.");
    }
    throw e;
  }
  if (!cfg.appUrl) return error(500, "Falta la URL base de la tienda en el servidor (PAYU_APP_URL).");

  // Modo preview: calcula y firma sin escribir (para pruebas de cálculo/tampering)
  if (preview) {
    const { signature, monto } = firmaCheckout({ referenceCode: "PREVIEW", amount: total });
    void signature;
    return NextResponse.json({ ok: true, preview: true, items, subtotal, shipping, total, montoFirmado: monto, currency: cfg.currency });
  }

  // Referencia única (verificada en base de datos)
  let reference = "";
  for (let intento = 0; intento < 3; intento++) {
    const cand = generarReferencia();
    const q = query(collection(db, ORDERS), where("referenciaPayU", "==", cand), limit(1));
    const existe = await getDocs(q);
    if (existe.empty) {
      reference = cand;
      break;
    }
  }
  if (!reference) return error(500, "No pude generar una referencia única. Intenta de nuevo.");

  const botellas = items.reduce((a, i) => a + i.qty, 0);
  let orderId;
  try {
    const ref = await addDoc(collection(db, ORDERS), {
      referenciaPayU: reference,
      customer: { name: nombre, phone: telefono, address: direccion, email },
      items,
      subtotal,
      discount: 0,
      shipping,
      shippingCost: shipping.cost,
      total,
      payment: "PayU",
      paymentState: "pending",
      notes,
      status: "pendiente",
      uid: uid || null,
      userEmail: userEmail || "",
      origen: "tienda-payu",
      payu: {
        env: cfg.env,
        merchantId: cfg.merchantId,
        accountId: cfg.accountId,
        currency: cfg.currency,
        transactionId: null,
        referencePol: null,
        responseCode: null,
        responseMessage: null,
        paymentMethod: null,
        processedTransactions: [],
        stockDescontado: false,
        history: [{ at: new Date().toISOString(), from: null, to: "pending", detalle: "Orden creada, esperando pago" }],
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    orderId = ref.id;
  } catch (e) {
    logPayu("crear-orden: error guardando", reference, e?.message || e);
    return error(500, "No pude crear la orden. Intenta de nuevo.");
  }

  // Firma server-side (el apiKey jamás sale del servidor)
  const { signature, monto } = firmaCheckout({ referenceCode: reference, amount: total });

  const formData = {
    merchantId: cfg.merchantId,
    accountId: cfg.accountId,
    description: `Vino Mompox · ${botellas} botella(s) · ${reference} · envío ${shipping.zoneName || ""}`.slice(0, 255),
    referenceCode: reference,
    amount: monto,
    tax: "0",
    taxReturnBase: "0",
    currency: cfg.currency || PAYU_CURRENCY,
    signature,
    test: cfg.test,
    buyerEmail: email,
    responseUrl: `${cfg.appUrl}/pago/resultado`,
    confirmationUrl: `${cfg.appUrl}/api/payu/confirmacion`,
  };

  logPayu("orden creada", reference, `env=${cfg.env}`, `total=${total}`, `items=${items.length}`);
  return NextResponse.json({ ok: true, orderId, reference, total, subtotal, shipping, currency: formData.currency, env: cfg.env, gatewayUrl: cfg.gatewayUrl, formData });
}
