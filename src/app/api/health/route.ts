import { answer, configured, db, guard, failure } from "@/lib/server";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    await guard(req, "read");
    if (!configured()) return answer({ connected: false, reason: "not_configured" });
    await db().query("SELECT 1");
    return answer({ connected: true });
  } catch (error) { return failure(error); }
}
