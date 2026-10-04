import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#090d16" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://restauracore.com"),
  title: {
    default: "RestauraCore — Sistema Integral para Restaurantes",
    template: "%s | RestauraCore",
  },
  description:
    "El software todo en uno para restaurantes: pedidos QR en mesa, comandera en tiempo real (KDS), inventario con costeo automático, arqueo ciego de caja e IA antifraude.",
  keywords: [
    "restaurante",
    "software restaurante",
    "punto de venta",
    "kds cocina",
    "menu qr digital",
    "control de mermas",
    "inventario restaurantes",
    "pos mexico",
  ],
  authors: [{ name: "RestauraCore Team" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RestauraCore",
  },
  openGraph: {
    title: "RestauraCore — Automatiza tu Restaurante de Punta a Punta",
    description:
      "Digitaliza pedidos, elimina mermas no justificadas y maximiza la rentabilidad de tu restaurante con prueba gratuita de 14 días.",
    url: "https://restauracore.com",
    siteName: "RestauraCore",
    images: [
      {
        url: "/logo.svg",
        width: 1200,
        height: 630,
        alt: "RestauraCore Plataforma para Restaurantes",
      },
    ],
    locale: "es_MX",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
