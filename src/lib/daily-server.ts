import "server-only";
import { db, ApiError } from "./server";
import { dailyListing, type StoredAllocation, type StoredOrder, type StoredSchedule } from "./daily-listing";
import { manausDate } from "./domain";
import { type Filters } from "./types";

// Consulta de leitura sobre as tabelas existentes, sem novas migrações SQL.
// Busca em blocos para não truncar programações na paginação padrão do PostgREST.
async function allRows(table: "est_ops" | "est_programacoes" | "est_alocacoes", columns: string, sortKeys: string[]) {
  const result: Record<string, unknown>[] = [];
  const STEP = 500;
  for (let start = 0; ; start += STEP) {
    let query = db().from(table).select(columns);
    for (const column of sortKeys) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(start, start + STEP - 1);
    if (error) {
      console.error("Falha ao consultar programação diária", { table, code: error.code, message: error.message });
      throw new ApiError("Não foi possível consultar as programações diárias.", 503);
    }
    const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
    result.push(...rows);
    if (rows.length < STEP) break;
    if (result.length >= 100000) throw new ApiError("A programação ultrapassou o limite de consulta.", 503);
  }
  return result;
}

async function currentRevision(client: ReturnType<typeof db>): Promise<number> {
  const { data, error } = await client.from("est_estado")
    .select("revisao").eq("id", true).single();
  if (error || !data) {
    console.error("Falha ao consultar revisão da programação", { code: error?.code });
    throw new ApiError("Não foi possível carregar a revisão da programação.", 503);
  }
  return Number(data.revisao);
}

export async function getDailyListing(filters: Filters) {
  const client = db();
  // A importação troca a programação em uma transação. Se houver uma
  // substituição simultânea à leitura, refazemos a consulta para não misturar
  // OPs, alocações e datas de revisões diferentes.
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await currentRevision(client);
    const [orders, schedules, allocations, last] = await Promise.all([
      allRows("est_ops", "id,op_pai,referencia_prod,potencia_pa,linha_prod,nome_cliente,qtd_op_pai", ["id"]),
      allRows("est_programacoes", "id,op_id,data_programada,qtd_programada,serie_inicial,serie_final", ["id"]),
      allRows("est_alocacoes", "programacao_id,subsetor_id,quantidade,versao", ["programacao_id", "subsetor_id"]),
      client.from("est_importacoes").select("nome_arquivo,realizado_em")
        .order("id", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (last.error) {
      console.error("Falha ao consultar última importação", { code: last.error.code });
      throw new ApiError("Não foi possível carregar os dados da importação.", 503);
    }
    const after = await currentRevision(client);
    if (before !== after) continue;
    return dailyListing(
      orders as unknown as StoredOrder[],
      schedules as unknown as StoredSchedule[],
      allocations as unknown as StoredAllocation[],
      filters,
      manausDate(),
      after,
      last.data || null,
    );
  }
  throw new ApiError("A programação foi atualizada durante a consulta. Atualize a tela e tente novamente.", 409);
}
