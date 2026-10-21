import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
for (const interfaces of Object.values(networkInterfaces())) {
  for (const entry of interfaces ?? []) {
    if (entry.family === "IPv4" && !entry.internal) localHosts.add(entry.address);
  }
}
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["xlsx"],
  // O Next.js precisa autorizar explicitamente HMR quando a página é aberta
  // por IP. Os endereços são detectados ao iniciar o servidor, não fixados.
  allowedDevOrigins: [...localHosts],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
