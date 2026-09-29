import Link from "next/link";

export const metadata = {
  title: "Términos y condiciones · Vino Mompox",
  description: "Condiciones de venta, envíos, pagos, retracto y aviso legal de la tienda Vino Mompox.",
};

const P = ({ children }) => <p className="text-sm font-medium leading-relaxed opacity-80 mt-3">{children}</p>;
const H = ({ children }) => <h2 className="font-display font-bold text-xl mt-6" style={{ color: "#4a0f1a" }}>{children}</h2>;
const Li = ({ children }) => <li className="text-sm font-medium leading-relaxed opacity-80 mt-1.5 ml-5 list-disc">{children}</li>;

export default function Terminos() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-5 py-10">
      <p className="kicker" style={{ color: "#b3402a" }}>— Legal —</p>
      <h1 className="font-display font-black display-seccion" style={{ color: "#4a0f1a" }}>
        Términos, <span className="italic" style={{ color: "#b3402a" }}>ventas</span> y aviso legal
      </h1>
      <p className="text-xs font-bold opacity-60 mt-1">Última actualización: septiembre 2026</p>

      <H>1. Aviso legal: quiénes somos</H>
      <P>
        Vinos Mompox es un emprendimiento artesanal de Santa Cruz de Mompox, Bolívar, Colombia.
        Vendemos vinos artesanales de frutas del Caribe a través de esta tienda y WhatsApp.
        Contacto: [COMPLETAR: correo, WhatsApp y NIT/dirección si aplica].
      </P>

      <H>2. Productos y precios</H>
      <P>
        Vendemos vino artesanal de corozo, mango, mamón, ciruela y maracuyá en presentación de
        750 ml, además de combos. Los precios están en pesos colombianos (COP) e incluyen impuestos
        cuando aplica. Las fotos son de referencia: al ser artesanal, el color puede variar un poco
        entre lotes. El stock que ves es el disponible; si se agota, el botón lo indica.
      </P>

      <H>3. Cómo comprar</H>
      <P>Arma tu canasta, escribe tus datos de entrega (dirección, ciudad y departamento), elige el pago y confirma. Para comprar debes entrar con Google, aceptar esta política y confirmar que tienes 18 años o más. Sin esos tres requisitos no se crea el pedido.</P>

      <H>4. Pagos</H>
      <ul>
        <Li><b>WhatsApp + Nequi / efectivo / transferencia:</b> coordinas el pago por chat antes del envío.</Li>
        <Li><b>Mercado Pago:</b> pago en línea con tarjeta, PSE o dinero en cuenta, procesado de forma segura por Mercado Pago. Nunca vemos ni guardamos tu tarjeta.</Li>
      </ul>

      <H>5. Envíos</H>
      <P>
        El costo se calcula automáticamente según tu ciudad al escribir la dirección. Si tu ciudad
        aún no tiene cobertura, te lo avisamos y lo coordinamos por WhatsApp. Los tiempos
        aproximados son: [COMPLETAR: ej. 1-2 días Caribe, 3-5 días resto del país]. El riesgo del
        transporte lo asumimos hasta la entrega: si la botella llega rota, la reponemos (avísanos
        con foto en máximo 48 horas).
      </P>

      <H>6. Derecho de retracto y reversión (Ley 1480 de 2011)</H>
      <P>
        Tienes 5 días hábiles después de la entrega para retractarte, siempre que la botella esté
        sellada y sin abrir (por higiene y al ser un alimento). Te devolvemos el dinero por el mismo
        medio de pago en máximo 30 días calendario. Si pagaste en línea y no recibiste el producto,
        puedes pedir la reversión del pago a tu banco o a Mercado Pago.
      </P>

      <H>7. Prohibición a menores</H>
      <P>
        Prohibida la venta de alcohol a menores de 18 años (Ley 124 de 1994). El repartidor puede
        pedir tu cédula. El exceso de alcohol es perjudicial para la salud.
      </P>

      <H>8. Quejas y reclamos</H>
      <P>
        Escríbenos por WhatsApp o a [COMPLETAR: correo] y respondemos en máximo 15 días hábiles.
        También puedes acudir a la Superintendencia de Industria y Comercio (SIC).
      </P>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link href="/privacidad" className="btn-relieve btn-crema px-5 py-2.5 text-sm font-extrabold">Privacidad</Link>
        <Link href="/cookies" className="btn-relieve btn-crema px-5 py-2.5 text-sm font-extrabold">Cookies</Link>
        <Link href="/" className="btn-relieve btn-vino px-5 py-2.5 text-sm font-extrabold">Volver a la tienda</Link>
      </div>
    </div>
  );
}
