import { answer, configured, db, guard, failure, ApiError } from "@/lib/server";
import { createRequestCache } from "@/lib/request-cache";
import { withDbDeadline } from "@/lib/db-timeout";
import { parseRevisionRow } from "@/lib/revision-row";
export const runtime = "nodejs";

// O antigo health check chamava est_previa_importacao e varria todas as OPs.
// A saúde deve depender só de uma leitura de uma linha, limitada a 8 segundos.
const health = createRequestCache(() => withDbDeadline(8_000, async () => {
  const { data, error } = await db().from("est_estado")
    .select("revisao").eq("id", true).limit(1).maybeSingle();
  if (error || parseRevisionRow(data) === null) {
    console.error("Falha na verificação de conexão", { code: error?.code });
    throw new ApiError("Banco temporariamente indisponível.", 503);
  }
  return true;
}), { ttlMs: 20_000, failureCooldownMs: 15_000 });

export async function GET(req: Request) {
  try {
    await guard(req, "read");
    if (!configured()) return answer({ connected: false, reason: "not_configured" });
    await health.get();
    return answer({ connected: true });
  } catch (e) {
    return failure(e);
  }
}
