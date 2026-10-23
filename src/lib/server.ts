import "server-only";
import { Pool, type PoolConfig } from "pg";
import { ZodError } from "zod";
import { isLocalDevelopmentOrigin } from "./local-network";

export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** One small pool per warm server instance. Use Neon's POOLED DATABASE_URL. */
let pool: Pool | undefined;
export function configured() { return Boolean(process.env.DATABASE_URL); }
export function db() {
  if (!configured()) throw new ApiError("Configure DATABASE_URL (Neon) no servidor.", 503);
  if (!pool) {
    const options: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 7_000,
      statement_timeout: 45_000,
      query_timeout: 50_000,
      allowExitOnIdle: true,
    };
    pool = new Pool(options);
    pool.on("error", (error) => console.error("Conexão PostgreSQL ociosa falhou", error.message));
  }
  return pool;
}

/** Fixed SQL statements: user input is ALWAYS passed as parameters. */
const procedures = {
  est_previa_importacao: "SELECT public.est_previa_importacao($1::jsonb) AS value",
  est_importar: "SELECT public.est_importar($1::jsonb,$2::text,$3::bigint,$4::uuid) AS value",
  est_registrar: "SELECT public.est_registrar($1::uuid,$2::bigint,$3::smallint,$4::integer,$5::text,$6::bigint,$7::text) AS value",
} as const;

type Procedures = keyof typeof procedures;
export async function rpc<T>(name: Procedures, args: Record<string, unknown>): Promise<T> {
  const values = name === "est_previa_importacao"
    ? [JSON.stringify(args.p_ops)]
    : name === "est_importar"
      ? [JSON.stringify(args.p_rows), args.p_nome, args.p_revision, args.p_request]
      : [args.p_request, args.p_programacao, args.p_subsetor, args.p_quantidade, args.p_modo, args.p_versao, args.p_observacao];
  try {
    const result = await db().query(procedures[name], values);
    return result.rows[0]?.value as T;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (["22023", "40001", "P0002"].includes(code || ""))
      throw new ApiError((error as Error).message, code === "22023" ? 422 : 409);
    console.error("Falha na operação PostgreSQL", { name, code, message: (error as Error).message });
    throw new ApiError("Falha no banco de dados. Consulte os logs do servidor.", 503);
  }
}

// No database writes to count API requests. This is a per-instance safety cap,
// NOT authentication or a distributed rate limit.
const limits = new Map<string, { start: number; count: number }>();
function localLimit(key: string, max: number) {
  const now = Date.now();
  const previous = limits.get(key);
  if (!previous || now - previous.start >= 60_000) {
    if (limits.size >= 1000) {
      for (const [k, value] of limits) if (now - value.start >= 60_000) limits.delete(k);
      if (limits.size >= 1000) throw new ApiError("Muitas requisições.", 429);
    }
    limits.set(key, { start: now, count: 1 });
  } else if (++previous.count > max) {
    throw new ApiError("Muitas requisições. Aguarde um minuto.", 429);
  }
}
export async function guard(request: Request, kind: "read" | "write" | "import") {
  if (process.env.NODE_ENV === "production" &&
    (process.env.ACCESS_RESTRICTION_CONFIRMED !== "true" || !process.env.APP_ORIGIN))
    throw new ApiError("Configure a proteção de acesso na hospedagem.", 503);
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const allowed = process.env.NODE_ENV === "production"
      ? !!origin && origin === process.env.APP_ORIGIN
      : isLocalDevelopmentOrigin(origin, request.url);
    if (!allowed) throw new ApiError("Origem da requisição não permitida.", 403);
  }
  // Platform-supplied headers only; never trust an arbitrary forwarded IP in local dev.
  const ip = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0] || "shared"
    : "shared";
  localLimit(`${ip}:${kind}`, kind === "read" ? 120 : kind === "import" ? 8 : 60);
}
export async function limitedBody(request: Request, max: number) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > max) throw new ApiError("Arquivo ou requisição excede o limite permitido.", 413);
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
        throw new ApiError("Arquivo ou requisição excede o limite permitido.", 413);
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
export function answer(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function failure(error: unknown) {
  if (error instanceof SyntaxError) return answer({ error: "Corpo da requisição inválido." }, 400);
  if (error instanceof ZodError) return answer({
    error: "Revise os campos informados.",
    details: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  }, 422);
  if (error instanceof ApiError) return answer({ error: error.message }, error.status);
  console.error("Erro inesperado na API", error instanceof Error ? error.message : "desconhecido");
  return answer({ error: "Não foi possível concluir. Atualize a tela e tente novamente." }, 500);
}
