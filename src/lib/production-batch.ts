import { createHash } from "node:crypto";

/** Stable per-sector IDs prevent duplicate inserts after a lost response. */
export function sectorRequestId(batchId: string, sector: number): string {
  const bytes = createHash("sha256")
    .update(`estamparia:production-batch:${batchId}:${sector}`)
    .digest();
  // UUID v4 format with deterministic bytes for safe idempotent retries.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type ProductionBatch = {
  requestId: string;
  programacao: number;
  modo: "adicionar";
  observacao: string;
  apontamentos: Array<{ subsetor: number; quantidade: number; versao: number }>;
};

type SqlQuery = (
  statement: string,
  params?: unknown[],
) => Promise<{ rows: Array<{ value?: unknown }> }>;

/** All writes share the same PostgreSQL transaction, so any failure rolls
 * back the entire batch. The original est_registrar validates each sector.
 */
export async function executeAtomicBatch(
  p: ProductionBatch,
  query: SqlQuery,
  registerSql: string,
) {
  let started = false;
  try {
    await query("BEGIN");
    started = true;
    const results: unknown[] = [];
    for (const item of p.apontamentos) {
      const result = await query(registerSql, [
        sectorRequestId(p.requestId, item.subsetor),
        p.programacao,
        item.subsetor,
        item.quantidade,
        p.modo,
        item.versao,
        p.observacao,
      ]);
      results.push(result.rows[0]?.value);
    }
    await query("COMMIT");
    started = false;
    return { apontamentos: results, totalSubsetores: results.length };
  } catch (error) {
    if (started) {
      try { await query("ROLLBACK"); }
      catch (rollbackError) { console.error("Falha no ROLLBACK do lote", rollbackError); }
    }
    throw error;
  }
}
