import Link from "next/link";

export const metadata = {
  title: "Política de cookies · Vino Mompox",
  description: "Qué cookies usa la tienda Vino Mompox y cómo aceptarlas o rechazarlas.",
};

const P = ({ children }) => <p className="text-sm font-medium leading-relaxed opacity-80 mt-3">{children}</p>;
const H = ({ children }) => <h2 className="font-display font-bold text-xl mt-6" style={{ color: "#4a0f1a" }}>{children}</h2>;
const Li = ({ children }) => <li className="text-sm font-medium leading-relaxed opacity-80 mt-1.5 ml-5 list-disc">{children}</li>;

export default function Cookies() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-5 py-10">
      <p className="kicker" style={{ color: "#b3402a" }}>— Legal —</p>
      <h1 className="font-display font-black display-seccion" style={{ color: "#4a0f1a" }}>
        Política de <span className="italic" style={{ color: "#b3402a" }}>cookies</span>
      </h1>
      <p className="text-xs font-bold opacity-60 mt-1">Última actualización: septiembre 2026</p>

      <H>1. Qué son</H>
      <P>
        Archivos pequeños que guardamos en tu navegador para que la tienda funcione (por ejemplo,
        recordar tu canasta y tu sesión). No usamos cookies para vender publicidad.
      </P>

      <H>2. Cuáles usamos</H>
      <ul>
        <Li><b>Necesarias (siempre activas):</b> canasta, sesión de Google y seguridad. Sin ellas la tienda no funciona.</Li>
        <Li><b>Analítica (solo si aceptas):</b> conteo anónimo de visitas para mejorar la tienda. Apagada por defecto.</Li>
      </ul>
      <P>
        Google (inicio de sesión) y Mercado Pago (checkout) pueden poner sus propias cookies con sus
        propias políticas cuando los usas.
      </P>

      <H>3. Tu decisión</H>
      <P>
        Al entrar ves un aviso: puedes <b>aceptar</b> o <b>rechazar</b> la analítica. Las necesarias
        siguen activas porque la tienda no anda sin ellas. Puedes cambiar de opinión borrando este
        dato en tu navegador o escribiéndonos (ver Privacidad).
      </P>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link href="/privacidad" className="btn-relieve btn-crema px-5 py-2.5 text-sm font-extrabold">Privacidad</Link>
        <Link href="/terminos" className="btn-relieve btn-crema px-5 py-2.5 text-sm font-extrabold">Términos</Link>
        <Link href="/" className="btn-relieve btn-vino px-5 py-2.5 text-sm font-extrabold">Volver a la tienda</Link>
      </div>
    </div>
  );
}
