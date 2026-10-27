import type { Metadata, Viewport } from "next";
import PwaRegistration from "@/components/PwaRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "ITAM | Estamparia e Radiador",
  description: "Programação e acompanhamento de produção da Estamparia e Radiador.",
  applicationName: "ITAM Produção",
  appleWebApp: { capable: true, title: "Estamparia", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#090d12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
