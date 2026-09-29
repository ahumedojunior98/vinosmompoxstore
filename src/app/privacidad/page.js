import Link from "next/link";

export const metadata = {
  title: "Política de privacidad · Vino Mompox",
  description: "Cómo tratamos tus datos personales en la tienda Vino Mompox (Ley 1581 de 2012).",
};

const P = ({ children }) => <p className="text-sm font-medium leading-relaxed opacity-80 mt-3">{children}</p>;
const H = ({ children }) => <h2 className="font-display font-bold text-xl mt-6" style={{ color: "#4a0f1a" }}>{children}</h2>;

export default function Privacidad() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-5 py-10">
      <p className="kicker" style={{ color: "#b3402a" }}>— Legal —</p>
      <h1 className="font-display font-black display-seccion" style={{ color: "#4a0f1a" }}>
        Política de <span className="italic" style={{ color: "#b3402a" }}>privacidad</span>
      </h1>
      <p className="text-xs font-bold opacity-60 mt-1">Última actualización: septiembre 2026 · Santa Cruz de Mompox, Bolívar, Colombia</p>

      <H>1. Quiénes somos</H>
      <P>
        Vinos Mompox, emprendimiento artesanal de Santa Cruz de Mompox, Bolívar, Colombia
        (contacto: [COMPLETAR: correo y WhatsApp]), es responsable del tratamiento de tus datos
        personales según la Ley 1581 de 2012 y el Decreto 1377 de 2013.
      </P>

      <H>2. Qué datos recogemos</H>
      <P>
        Solo los que nos das para comprar: nombre, teléfono/WhatsApp, dirección, ciudad,
        departamento, correo (pagos en línea) y el contenido de tu pedido. Si entras con Google,
        recibimos tu nombre, correo y foto de perfil. No recogemos datos de tarjetas: los pagos
        online se procesan en Mercado Pago, que tiene su propia política.
      </P>

      <H>3. Para qué los usamos</H>
      <P>
        Confirmar y entregar tu pedido, calcular el envío, contactarte por WhatsApp sobre tu compra,
        llevar el registro de ventas y, si aceptas, avisarte de novedades. Nada más.
      </P>

      <H>4. Tus derechos</H>
      <P>
        Puedes conocer, actualizar, corregir o eliminar tus datos, y revocar tu autorización,
        escribiendo a [COMPLETAR: correo de contacto]. Respondemos en máximo 15 días hábiles,
        como ordena la ley. También puedes reclamar ante la Superintendencia de Industria y Comercio (SIC).
      </P>

      <H>5. Conservación y seguridad</H>
      <P>
        Guardamos tus datos solo el tiempo necesario para la venta y las obligaciones legales,
        con acceso restringido. Nunca los vendemos ni los compartimos con terceros, salvo la
        transportadora para entregar tu pedido o una orden de autoridad competente.
      </P>

      <H>6. Menores de edad</H>
      <P>
        No vendemos alcohol a menores de 18 años (Ley 124 de 1994). Si detectamos un pedido de un
        menor, lo cancelamos. El repartidor puede pedir tu cédula al entregar.
      </P>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link href="/terminos" className="btn-relieve btn-crema px-5 py-2.5 text-sm font-extrabold">Términos y condiciones</Link>
        <Link href="/cookies" className="btn-relieve btn-crema px-5 py-2.5 text-sm font-extrabold">Política de cookies</Link>
        <Link href="/" className="btn-relieve btn-vino px-5 py-2.5 text-sm font-extrabold">Volver a la tienda</Link>
      </div>
    </div>
  );
}
