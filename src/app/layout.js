import "./globals.css";

export const metadata = {
  title: "Vino Mompox · Vinos artesanales del Caribe",
  description:
    "Vinos artesanales de Corozo, Mango, Mamón, Ciruela y Maracuyá, fermentados en Santa Cruz de Mompox, Bolívar. Pide por la tienda y recibe a domicilio.",
  keywords: ["vino de corozo", "vino mompox", "vino artesanal", "mompox bolivar", "vino de mango", "vino caribe"],
  icons: {
    icon: "/logo-vino-mompox-foto.jpg",
    apple: "/logo-vino-mompox-foto.jpg",
  },
  openGraph: {
    title: "Vino Mompox · Artesanal del Caribe",
    description: "Fermentado a mano en Mompox. Corozo, mango, mamón, ciruela y maracuyá.",
    type: "website",
    locale: "es_CO",
    images: [{ url: "/logo-vino-mompox-foto.jpg", alt: "Vino Mompox" }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
