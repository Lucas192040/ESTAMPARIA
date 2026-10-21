import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Estamparia | Acompanhamento da Produção",
    short_name: "Estamparia",
    description: "Programação e apontamento de produção da Estamparia.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#090d12",
    theme_color: "#090d12",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
