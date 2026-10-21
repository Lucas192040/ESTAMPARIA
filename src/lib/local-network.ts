import { networkInterfaces } from "node:os";

/** Hosts do próprio computador liberados exclusivamente para testes locais. */
export function localDevelopmentHosts(): string[] {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      const parts = entry.address.split(".").map(Number);
      if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) continue;
      const [a, b] = parts;
      // Só interfaces de LAN: não autorizar automaticamente um IP público.
      const privateAddress = a === 10 || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 169 && b === 254);
      if (privateAddress) hosts.add(entry.address);
    }
  }
  return [...hosts];
}

/**
 * No modo dev, o navegador deve declarar uma origem deste computador e
 * da porta em que o servidor está rodando. Não comparar com o Host recebido
 * ou com o hostname de request.url: o Next.js pode normalizar esses valores
 * para localhost/0.0.0.0 mesmo quando o navegador usou o endereço da LAN.
 *
 * Em produção, guard() continua exigindo APP_ORIGIN exato e configuração
 * de controle de acesso; esta função não é utilizada.
 */
export function isLocalDevelopmentOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = new URL(requestUrl);
    if (source.origin !== origin || source.username || source.password) return false;
    if (source.protocol !== "http:" && source.protocol !== "https:") return false;
    // npm run dev informa a porta real; não depender da URL interna do Next.js.
    // Mantém fallback quando o servidor foi iniciado diretamente com next dev.
    const developmentPort = process.env.EST_DEV_PORT || target.port ||
      (target.protocol === "https:" ? "443" : "80");
    const originPort = source.port || (source.protocol === "https:" ? "443" : "80");
    if (originPort !== developmentPort) return false;
    return localDevelopmentHosts().includes(source.hostname);
  } catch {
    return false;
  }
}
