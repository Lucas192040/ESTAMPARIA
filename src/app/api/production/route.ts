import { answer, failure, guard, limitedBody, rpc } from "@/lib/server";
import { invalidateDailyListing } from "@/lib/daily-server";
import { productionSchema } from "@/lib/validation";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    await guard(req, "write");
    const p = productionSchema.parse(
      JSON.parse((await limitedBody(req, 8192)).toString("utf8")),
    );
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
