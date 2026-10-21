import { z } from "zod";
import {
  answer,
  failure,
  guard,
  limitedBody,
  rpc,
  configured,
  ApiError,
} from "@/lib/server";
import { parseExcel, MAX_FILE_SIZE } from "@/lib/importer";
import type { ImportPreview } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    await guard(req, "import");
    const body = await limitedBody(req, MAX_FILE_SIZE + 64000);
    const form = await new Response(body, {
      headers: { "content-type": req.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ApiError("Selecione um arquivo Excel.");
    let parsed;
    try {
      parsed = parseExcel(Buffer.from(await file.arrayBuffer()), file.name);
    } catch (e) {
      throw new ApiError((e as Error).message, 422);
    }
    if (form.get("action") === "preview") {
      const database = configured()
        ? await rpc<ImportPreview["database"]>("est_previa_importacao", {
            p_ops: [...new Set(parsed.rows.map((r) => r.op_pai))],
          })
        : null;
      return answer({ ...parsed.preview, database });
    }
    if (form.get("action") !== "confirm") throw new ApiError("Ação inválida.");
    const revision = z.coerce
      .number()
      .int()
      .nonnegative()
      .parse(form.get("revision"));
    const requestId = z.uuid().parse(form.get("requestId"));
    if (form.get("hash") !== parsed.preview.hash)
      throw new ApiError("O arquivo mudou. Gere uma nova prévia.", 409);
    return answer(
      await rpc("est_importar", {
        p_rows: parsed.rows,
        p_nome: file.name.slice(0, 255),
        p_revision: revision,
        p_request: requestId,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
