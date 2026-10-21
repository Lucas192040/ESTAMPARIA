import { answer, failure, guard, limitedBody, rpc } from "@/lib/server";
import { productionSchema } from "@/lib/validation";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    await guard(req, "write");
    const p = productionSchema.parse(
      JSON.parse((await limitedBody(req, 8192)).toString("utf8")),
    );
    return answer(
      await rpc("est_registrar", {
        p_request: p.requestId,
        p_programacao: p.programacao,
        p_subsetor: p.subsetor,
        p_quantidade: p.quantidade,
        p_modo: p.modo,
        p_versao: p.versao,
        p_observacao: p.observacao,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
