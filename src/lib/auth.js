// Login con Google + roles + carrito en la nube para la tienda.
// Colección `users/{uid}`: { email, displayName, photoURL, role, provider,
//   createdAt, lastLogin, loginCount, ordersCount, totalGastado, updatedAt }
// Colección `carts/{uid}`: { items: { productId: qty }, updatedAt }
// El rol se decide al entrar: correo en NEXT_PUBLIC_ADMIN_EMAILS → "admin", resto → "user".
import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { auth, db } from "./firebase";

const USERS = "users";
const CARTS = "carts";

export function leerAdminEmails() {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function esAdminEmail(email) {
  if (!email) return false;
  return leerAdminEmails().includes(String(email).trim().toLowerCase());
}

export async function loginConGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);
  await asegurarUsuario(cred.user);
  return cred.user;
}

export async function salir() {
  await signOut(auth);
}

export async function asegurarUsuario(fbUser) {
  if (!fbUser) return null;
  const ref = doc(db, USERS, fbUser.uid);
  const snap = await getDoc(ref);
  const ahora = serverTimestamp();
  if (!snap.exists()) {
    const perfil = {
      email: fbUser.email || "",
      displayName: fbUser.displayName || "",
      photoURL: fbUser.photoURL || "",
      role: esAdminEmail(fbUser.email) ? "admin" : "user",
      provider: "google",
      createdAt: ahora,
      lastLogin: ahora,
      loginCount: 1,
      ordersCount: 0,
      totalGastado: 0,
      updatedAt: ahora,
    };
    await setDoc(ref, perfil);
    return { id: fbUser.uid, ...perfil };
  }
  const actual = snap.data() || {};
  const debeSerAdmin = esAdminEmail(fbUser.email || actual.email);
  await updateDoc(ref, {
    displayName: fbUser.displayName || actual.displayName || "",
    photoURL: fbUser.photoURL || actual.photoURL || "",
    email: fbUser.email || actual.email || "",
    ...(debeSerAdmin && actual.role !== "admin" ? { role: "admin" } : {}),
    lastLogin: ahora,
    loginCount: increment(1),
    updatedAt: ahora,
  });
  return { id: fbUser.uid, ...actual };
}

export function useSesion() {
  const [fbUser, setFbUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setFbUser(u || null);
      if (!u) {
        setPerfil(null);
        setCargando(false);
        return;
      }
      try {
        const ref = doc(db, USERS, u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setPerfil({ id: u.uid, ...snap.data() });
        } else {
          const creado = await asegurarUsuario(u);
          setPerfil(creado);
        }
      } catch {
        setPerfil(null);
      } finally {
        setCargando(false);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!fbUser) return;
    const unsub = onSnapshot(
      doc(db, USERS, fbUser.uid),
      (snap) => {
        if (snap.exists()) setPerfil({ id: snap.id, ...snap.data() });
      },
      () => {}
    );
    return () => unsub();
  }, [fbUser]);

  return { fbUser, perfil, cargando, esAdmin: perfil?.role === "admin" };
}

// ---------- Carrito en la nube ----------
// Lee el carrito guardado del usuario (una vez).
export async function leerCarritoNube(uid) {
  if (!uid) return {};
  try {
    const snap = await getDoc(doc(db, CARTS, uid));
    if (snap.exists()) return snap.data()?.items || {};
  } catch {
    /* sin permiso o sin doc → carrito vacío */
  }
  return {};
}

// Guarda el carrito del usuario (sobrescribe). Best-effort: no revienta si falla.
export async function guardarCarritoNube(uid, items) {
  if (!uid) return;
  try {
    await setDoc(
      doc(db, CARTS, uid),
      { items: items || {}, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    /* offline o reglas → se conserva el local */
  }
}

// Escucha cambios del carrito en otros dispositivos.
export function subscribeCarrito(uid, callback) {
  if (!uid) return () => {};
  return onSnapshot(
    doc(db, CARTS, uid),
    (snap) => {
      if (snap.exists()) callback(snap.data()?.items || {});
    },
    () => {}
  );
}

// Suma contadores de compra al perfil (best-effort, separado del pedido).
export async function registrarCompraUsuario(uid, total) {
  if (!uid) return;
  try {
    await updateDoc(doc(db, USERS, uid), {
      ordersCount: increment(1),
      totalGastado: increment(Number(total) || 0),
      lastOrderAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* no bloquea el pedido */
  }
}
