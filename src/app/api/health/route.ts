import { answer, configured, guard, failure, rpc } from "@/lib/server";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    await guard(req, "read");
    if (!configured())
      return answer({ connected: false, reason: "not_configured" });
    await rpc("est_previa_importacao", { p_ops: [] });
    return answer({ connected: true });
  } catch (e) {
    return failure(e);
  }
}
