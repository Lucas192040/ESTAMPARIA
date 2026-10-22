import "server-only";
import { db, ApiError } from "./server";
import { createRequestCache } from "./request-cache";
import { dailyListing, type StoredAllocation, type StoredOrder, type StoredSchedule } from "./daily-listing";
import { manausDate } from "./domain";
import { type Filters, type Listing } from "./types";

type Client = ReturnType<typeof db>;
type Snapshot = {
  orders: StoredOrder[];
  schedules: StoredSchedule[];
  allocations: StoredAllocation[];
  revision: number;
  lastImport: Listing["ultima_importacao"];
};

// Um carregamento usa no máximo 18 segundos; todas as consultas compartilham
// o mesmo deadline para não ocupar múltiplas conexões durante falhas da API.
const DB_READ_TIMEOUT_MS = 18_000;
const DATA_TTL_MS = 30_000;
const FAILURE_COOLDOWN_MS = 15_000;
const STEP = 500;
const MAX_ROWS = 100_000;

async function allRows(
  client: Client,
  signal: AbortSignal,
  table: "est_ops" | "est_programacoes" | "est_alocacoes",
  columns: string,
  sortKeys: string[],
) {
  const result: Record<string, unknown>[] = [];
  for (let start = 0; ; start += STEP) {
    let query = client.from(table).select(columns);
    for (const column of sortKeys) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(start, start + STEP - 1).abortSignal(signal);
    if (error) {
      console.error("Falha ao consultar programação diária", { table, code: error.code });
      throw new ApiError("Não foi possível consultar as programações diárias.", 503);
    }
    const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
    result.push(...rows);
    if (result.length >= MAX_ROWS) throw new ApiError("A programação ultrapassou o limite de consulta.", 503);
    if (rows.length < STEP) break;
  }
  return result;
}

async function currentRevision(client: Client, signal: AbortSignal) {
  const { data, error } = await client.from("est_estado")
    .select("revisao").eq("id", true).single().abortSignal(signal);
  if (error || !data) {
    console.error("Falha ao consultar revisão da programação", { code: error?.code });
    throw new ApiError("Não foi possível carregar a revisão da programação.", 503);
  }
  return Number(data.revisao);
}

async function loadSnapshot(): Promise<Snapshot> {
  const client = db();
  const signal = AbortSignal.timeout(DB_READ_TIMEOUT_MS);
  // A importação substitui a programação numa transação: comparar revisões
  // impede misturar tabelas que pertençam a versões distintas.
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await currentRevision(client, signal);
    // Executar sequencialmente: no plano Free evita solicitar quatro conexões
    // PostgREST simultâneas por instância. O cache compensa a latência.
    const orders = await allRows(client, signal, "est_ops", "id,op_pai,referencia_prod,potencia_pa,linha_prod,nome_cliente,qtd_op_pai", ["id"]);
    const schedules = await allRows(client, signal, "est_programacoes", "id,op_id,data_programada,qtd_programada,serie_inicial,serie_final", ["id"]);
    const allocations = await allRows(client, signal, "est_alocacoes", "programacao_id,subsetor_id,quantidade,versao", ["programacao_id", "subsetor_id"]);
    const last = await client.from("est_importacoes").select("nome_arquivo,realizado_em")
      .order("id", { ascending: false }).limit(1).maybeSingle().abortSignal(signal);
    if (last.error) {
      console.error("Falha ao consultar última importação", { code: last.error.code });
      throw new ApiError("Não foi possível carregar os dados da importação.", 503);
    }
    const after = await currentRevision(client, signal);
    if (before !== after) continue;
    return {
      orders: orders as unknown as StoredOrder[],
      schedules: schedules as unknown as StoredSchedule[],
      allocations: allocations as unknown as StoredAllocation[],
      revision: after,
      lastImport: last.data || null,
    };
  }
  throw new ApiError("A programação foi atualizada durante a consulta. Atualize a tela e tente novamente.", 409);
}

// Cache compartilhado apenas entre requisições da mesma instância. Todos os
// filtros, páginas e clientes reutilizam o snapshot, mas cada resposta é
// calculada separadamente pelas regras originais de dailyListing.
const snapshotCache = createRequestCache(loadSnapshot, {
  ttlMs: DATA_TTL_MS,
  failureCooldownMs: FAILURE_COOLDOWN_MS,
});

export function invalidateDailyListing() {
  snapshotCache.invalidate();
}

export async function getDailyListing(filters: Filters, force = false) {
  const snapshot = await snapshotCache.get(force);
  return dailyListing(
    snapshot.orders,
    snapshot.schedules,
    snapshot.allocations,
    filters,
    manausDate(),
    snapshot.revision,
    snapshot.lastImport,
  );
}
