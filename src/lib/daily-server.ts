import "server-only";
import { db, ApiError } from "./server";
import { createRequestCache } from "./request-cache";
import { dailyDataset, dailyListing, type StoredAllocation, type StoredRadiatorAllocation, type StoredOrder, type StoredSchedule } from "./daily-listing";
import { manausDate } from "./domain";
import { type DailyDataset, type Filters, type Listing } from "./types";

type Snapshot = {
  orders: StoredOrder[];
  schedules: StoredSchedule[];
  allocations: StoredAllocation[];
  radiatorAllocations: StoredRadiatorAllocation[];
  revision: number;
  lastImport: Listing["ultima_importacao"];
};

// ONE read-only SQL request instead of multiple paginated REST requests +
// revision checks. A single PostgreSQL statement sees a consistent snapshot.
const SNAPSHOT_SQL = `
SELECT
  (SELECT revisao FROM public.est_estado WHERE id = true) AS revision,
  COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id)
    FROM (SELECT id, op_pai, referencia_prod, potencia_pa, linha_prod,
                 nome_cliente, qtd_op_pai FROM public.est_ops) o), '[]'::jsonb) AS orders,
  COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
    FROM (SELECT id, op_id, data_programada, qtd_programada,
                 serie_inicial, serie_final FROM public.est_programacoes) p), '[]'::jsonb) AS schedules,
  COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.programacao_id, a.subsetor_id)
    FROM (SELECT programacao_id, subsetor_id, quantidade, versao FROM public.est_alocacoes) a), '[]'::jsonb) AS allocations,
  COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.programacao_id)
    FROM (SELECT programacao_id, quantidade, versao FROM public.rad_alocacoes) a), '[]'::jsonb) AS "radiatorAllocations",
  (SELECT jsonb_build_object('nome_arquivo', nome_arquivo, 'realizado_em', realizado_em)
   FROM public.est_importacoes ORDER BY id DESC LIMIT 1) AS "lastImport"`;

async function loadSnapshot(): Promise<Snapshot> {
  try {
    const { rows } = await db().query<Snapshot>(SNAPSHOT_SQL);
    const snapshot = rows[0];
    const revision = Number(snapshot?.revision);
    if (!snapshot || snapshot.revision == null || !Number.isSafeInteger(revision) || revision < 0)
      throw new Error("Revisão da programação não encontrada ou inválida.");
    return { ...snapshot, revision };
  } catch (error) {
    console.error("Falha na leitura da programação", (error as Error).message);
    throw new ApiError("Não foi possível carregar as programações.", 503);
  }
}

// A shared cache prevents every search/page action from hitting Neon.
// Write/import invalidate locally; their UI forces fresh=1 after success.
const snapshotCache = createRequestCache(loadSnapshot, {
  ttlMs: 120_000,
  failureCooldownMs: 15_000,
});
export function invalidateDailyListing() { snapshotCache.invalidate(); }
export async function getDailyListing(filters: Filters, force = false) {
  const snapshot = await snapshotCache.get(force);
  return dailyListing(
    snapshot.orders, snapshot.schedules, snapshot.allocations,
    filters, manausDate(), snapshot.revision, snapshot.lastImport, snapshot.radiatorAllocations,
  );
}

/** Returns all per-date rows from the very same cached SQL snapshot. */
export async function getDailyDataset(force = false): Promise<DailyDataset> {
  const snapshot = await snapshotCache.get(force);
  return dailyDataset(
    snapshot.orders, snapshot.schedules, snapshot.allocations,
    manausDate(), snapshot.revision, snapshot.lastImport, snapshot.radiatorAllocations,
  );
}
