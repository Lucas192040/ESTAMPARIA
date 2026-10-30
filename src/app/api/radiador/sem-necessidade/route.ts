import { requireRole } from "@/lib/auth";
import { answer, failure, guard, limitedBody, db, ApiError } from "@/lib/server";
import { invalidateDailyListing } from "@/lib/daily-server";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    await requireRole("radiador");
    await guard(req, "write");
    const body = JSON.parse((await limitedBody(req, 4096)).toString("utf8")) as { programacaoIds?: unknown };
    const ids = body.programacaoIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 ||
      ids.some((id) => !Number.isSafeInteger(id) || Number(id) < 1) ||
      new Set(ids).size !== ids.length) throw new ApiError("Programações inválidas.");
    const client = await db().connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        "SELECT id, op_id, data_programada FROM public.est_programacoes WHERE id = ANY($1::bigint[]) FOR UPDATE",
        [ids],
      );
      if (found.rows.length !== ids.length ||
        found.rows.some((r) => r.op_id !== found.rows[0].op_id || String(r.data_programada).slice(0,10) !== String(found.rows[0].data_programada).slice(0,10)))
        throw new ApiError("As programações não pertencem à mesma OP e data.", 422);
      await client.query(
        "INSERT INTO public.rad_sem_necessidade (programacao_id) SELECT unnest($1::bigint[]) ON CONFLICT (programacao_id) DO NOTHING",
        [ids],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
    invalidateDailyListing();
    return answer({ ok: true });
  } catch (error) { return failure(error); }
}
