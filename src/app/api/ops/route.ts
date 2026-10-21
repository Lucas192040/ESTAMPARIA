import { answer, failure, guard, configured } from "@/lib/server";
import { getDailyListing } from "@/lib/daily-server";
import { filtersSchema } from "@/lib/validation";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    await guard(req, "read");
    if (!configured()) return answer({ connected: false });
    const filters = filtersSchema.parse(
      Object.fromEntries(new URL(req.url).searchParams),
    );
    const result = await getDailyListing(filters);
    return answer({ ...result, connected: true });
  } catch (e) {
    return failure(e);
  }
}
