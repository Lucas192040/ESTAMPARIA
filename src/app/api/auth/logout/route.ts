import { clearSession } from "@/lib/auth";
import { answer, failure, guard } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try { await guard(req, "write"); await clearSession(); return answer({ ok: true }); }
  catch (error) { return failure(error); }
}
