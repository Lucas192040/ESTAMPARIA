"use client";

import { useEffect } from "react";

/** Instala somente o suporte offline da interface; dados de produção não são armazenados em cache. */
export default function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    // O SW só controla o mesmo domínio que serviu a página (HTTPS na Vercel).
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
      console.warn("Não foi possível registrar o PWA:", error);
    });
  }, []);

  return null;
}
