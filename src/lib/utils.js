import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatCOP(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function precioFinal(product) {
  const price = Number(product?.price) || 0;
  const discount = Number(product?.discount) || 0;
  return Math.round(price * (1 - discount / 100));
}
