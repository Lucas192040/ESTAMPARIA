import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Estamparia | Acompanhamento da Produção",
  description: "Programação e apontamento de produção da Estamparia.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
