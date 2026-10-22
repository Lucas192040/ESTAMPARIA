import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { supabaseFetch } from "./db-timeout";
import { isLocalDevelopmentOrigin } from "./local-network";
import { ZodError } from "zod";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function configured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
let serverClient: ReturnType<typeof createClient> | undefined;
export function db() {
  if (!configured())
    throw new ApiError(
      "Conexão ainda não configurada. Configure o Supabase no servidor.",
      503,
    );
  serverClient ??= createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: supabaseFetch },
    },
  );
  return serverClient;
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  // This project calls database functions dynamically and has no generated
  // Supabase Database schema. The SDK otherwise infers RPC Args as `undefined`.
  // Cast only the RPC boundary, keeping caller arguments and response checked.
  type RpcResult = {
    data: unknown;
    error: { code: string; message: string; details: string | null; hint: string | null } | null;
  };
  const client = db() as unknown as {
    rpc: (functionName: string, functionArgs: Record<string, unknown>) => PromiseLike<RpcResult>;
  };
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (["22023", "40001", "P0002"].includes(error.code))
      throw new ApiError(error.message, error.code === "22023" ? 422 : 409);
    // Diagnóstico apenas no servidor: nunca registrar chaves ou a planilha inteira.
    console.error("Database operation failed", {
      operation: name,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (name === "est_importar" && error.code === "21000")
      throw new ApiError(
        "O banco encontrou mais de um registro da mesma OP durante a importação. Execute o SQL de correção em supabase/migrations/20261020193000_corrigir_importacao_ops_repetidas.sql e tente novamente.",
        503,
      );
    throw new ApiError(
      "Falha na operação de banco. Consulte os detalhes no terminal do servidor e confira as migrações SQL.",
      503,
    );
  }
  return data as T;
}
// Limite local para consultas de leitura. A listagem nunca depende de uma
// escrita no banco apenas para autorizar um GET: est_limitar pode bloquear a
// tabela est_limites e deixar todo o painel indisponível por 45 segundos.
// A proteção distribuída por est_limitar permanece obrigatória para escritas
// e importações. Em serverless o limite local é por instância, não global;
// manter a aplicação atrás de controle de acesso na hospedagem.
const limits = new Map<string, { start: number; count: number }>();
function localLimit(key: string, max: number) {
  const now = Date.now();
  const previous = limits.get(key);
  if (!previous || now - previous.start >= 60_000) {
    // Evita crescimento indefinido em instâncias que continuam aquecidas.
    if (limits.size >= 5000) {
      for (const [oldKey, value] of limits) {
        if (now - value.start >= 60_000) limits.delete(oldKey);
      }
    }
    if (limits.size >= 5000 && !limits.has(key))
      throw new ApiError("Muitas requisições. Aguarde um minuto.", 429);
    limits.set(key, { start: now, count: 1 });
  } else if (++previous.count > max) {
    throw new ApiError("Muitas requisições. Aguarde um minuto.", 429);
  }
}
export async function guard(
  request: Request,
  kind: "read" | "write" | "import",
) {
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.ACCESS_RESTRICTION_CONFIRMED !== "true" ||
      !process.env.APP_ORIGIN)
  )
    throw new ApiError(
      "Acesso pendente de configuração segura na hospedagem.",
      503,
    );
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    // Desenvolvimento local: localhost e IPv4 das interfaces ativas, sem
    // precisar modificar .env.local ao alternar entre PC e rede interna.
    // Hospedagem de produção: conserva a validação estrita de APP_ORIGIN.
    const allowed =
      process.env.NODE_ENV === "production"
        ? !!origin && origin === process.env.APP_ORIGIN
        : isLocalDevelopmentOrigin(origin, request.url);
    if (!allowed) {
      // Apenas diagnóstico em desenvolvimento; não registrar corpo nem credenciais.
      if (process.env.NODE_ENV !== "production") {
        console.warn("Origem de escrita recusada", {
          origin: origin?.slice(0, 150) ?? null,
          host: request.headers.get("host")?.slice(0, 150) ?? null,
          requestOrigin: new URL(request.url).origin,
        });
      }
      throw new ApiError("Origem da requisição não permitida.", 403);
    }
  }
  // On Vercel this header is platform supplied. Else aggregate under one key; never trust arbitrary X-Forwarded-For.
  const ip = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0] || "shared"
    : "shared";
  const max = kind === "read" ? 180 : kind === "import" ? 8 : 60;
  const key = configured()
    ? createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
        .update(`${ip}:${kind}`)
        .digest("hex")
    : `${ip}:${kind}`;
  if (kind === "read" || !configured()) {
    // GET continua limitado sem depender do RPC est_limitar.
    // POST mantém o limite centralizado no banco, inclusive em produção.
    localLimit(key, max);
    return;
  }
  if (!(await rpc<boolean>("est_limitar", { p_chave: key, p_max: max })))
    throw new ApiError("Muitas requisições. Aguarde um minuto.", 429);
}
export async function limitedBody(request: Request, max: number) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > max)
    throw new ApiError("Arquivo ou requisição excede o limite permitido.", 413);
  if (!request.body) throw new ApiError("Requisição vazia.");
  const reader = request.body.getReader();
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new ApiError(
          "Arquivo ou requisição excede o limite permitido.",
          413,
        );
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
export function answer(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function failure(error: unknown) {
  if (error instanceof SyntaxError)
    return answer({ error: "Corpo da requisição inválido." }, 400);
  if (error instanceof ZodError)
    return answer(
      {
        error: "Revise os campos informados.",
        details: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      422,
    );
  if (error instanceof ApiError)
    return answer({ error: error.message }, error.status);
  console.error("Unexpected API error", {
    type: error instanceof Error ? error.name : "unknown",
  });
  return answer(
    { error: "Não foi possível concluir. Atualize a tela e tente novamente." },
    500,
  );
}
