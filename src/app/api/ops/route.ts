import { answer, failure, guard, configured } from "@/lib/server";
import { getDailyListing } from "@/lib/daily-server";
import { filtersSchema } from "@/lib/validation";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    await guard(req, "read");
    if (!configured()) return answer({ connected: false });
    const params = new URL(req.url).searchParams;
    const filters = filtersSchema.parse(Object.fromEntries(params));
    // Atualização explícita após apontamento/importação deve superar o TTL.
    const result = await getDailyListing(filters, params.get("fresh") === "1");
    return answer({ ...result, connected: true });
  } catch (e) {
    return failure(e);
  }
}
