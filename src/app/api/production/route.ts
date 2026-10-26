import { answer, failure, guard, limitedBody, rpc, rpcProductionBatch } from "@/lib/server";
import { invalidateDailyListing } from "@/lib/daily-server";
import { productionBatchSchema, productionSchema } from "@/lib/validation";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    await guard(req, "write");
    const body: unknown = JSON.parse((await limitedBody(req, 8192)).toString("utf8"));
    if (body && typeof body === "object" && "apontamentos" in body) {
      const batch = productionBatchSchema.parse(body);
      const result = await rpcProductionBatch(batch);
      invalidateDailyListing();
      return answer(result);
    }
    // Preserve the legacy one-subsector endpoint for corrections and old clients.
    const p = productionSchema.parse(body);
    const result = await rpc("est_registrar", {
        p_request: p.requestId,
        p_programacao: p.programacao,
        p_subsetor: p.subsetor,
        p_quantidade: p.quantidade,
        p_modo: p.modo,
        p_versao: p.versao,
        p_observacao: p.observacao,
      });
    invalidateDailyListing();
    return answer(result);
  } catch (e) {
    return failure(e);
  }
}
