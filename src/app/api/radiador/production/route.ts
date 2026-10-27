import { requireRole } from "@/lib/auth";
import { answer, failure, guard, limitedBody, rpc } from "@/lib/server";
import { radiatorProductionSchema } from "@/lib/validation";
import { invalidateDailyListing } from "@/lib/daily-server";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    await requireRole("radiador");
    await guard(req, "write");
    const p = radiatorProductionSchema.parse(JSON.parse((await limitedBody(req, 4096)).toString("utf8")));
    const result = await rpc("rad_registrar", {
      p_request: p.requestId, p_programacao: p.programacao, p_quantidade: p.quantidade,
      p_modo: p.modo, p_versao: p.versao, p_observacao: p.observacao,
    });
    invalidateDailyListing();
    return answer(result);
  } catch (error) { return failure(error); }
}
