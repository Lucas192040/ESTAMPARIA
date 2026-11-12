import { requireRole } from "@/lib/auth";
import { answer, failure, guard } from "@/lib/server";
import { db } from "@/lib/server";
import { ferragemDb } from "@/lib/ferragem-server";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    await requireRole("master");
    await guard(req, "read");
    const [main, ferragem] = await Promise.all([
      db().query(`
        SELECT
          (SELECT MAX(registrado_em) FROM public.est_apontamentos) AS estamparia,
          (SELECT MAX(registrado_em) FROM public.pintura_apontamentos_historico) AS pintura,
          GREATEST(
            (SELECT MAX(registrado_em) FROM public.rad_apontamentos),
            (SELECT MAX(marcado_em) FROM public.rad_sem_necessidade)
          ) AS radiador
      `),
      ferragemDb().query("SELECT MAX(registrado_em) AS ferragem FROM public.fer_apontamentos_historico")
    ]);
    return answer({
      estamparia: main.rows[0]?.estamparia ?? null,
      radiador: main.rows[0]?.radiador ?? null,
      ferragem: ferragem.rows[0]?.ferragem ?? null,
      pintura: main.rows[0]?.pintura ?? null,
      timezone: "America/Manaus"
    });
  } catch (error) { return failure(error); }
}
