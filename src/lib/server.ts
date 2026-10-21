import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
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
export function db() {
  if (!configured())
    throw new ApiError(
      "Conexão ainda não configurada. Configure o Supabase no servidor.",
      503,
    );
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await db()
    .rpc(name, args)
    .abortSignal(AbortSignal.timeout(45000));
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
const limits = new Map<string, { start: number; count: number }>();
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
  if (configured()) {
    const key = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .update(`${ip}:${kind}`)
      .digest("hex");
    if (!(await rpc<boolean>("est_limitar", { p_chave: key, p_max: max })))
      throw new ApiError("Muitas requisições. Aguarde um minuto.", 429);
  } else {
    const now = Date.now(),
      entry = limits.get(kind);
    if (!entry || now - entry.start > 60000)
      limits.set(kind, { start: now, count: 1 });
    else if (++entry.count > max)
      throw new ApiError("Muitas requisições. Aguarde um minuto.", 429);
  }
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
