import { z } from "zod";
import { guard, answer, failure, limitedBody, ApiError } from "@/lib/server";
import { setSession, verifyCredentials } from "@/lib/auth";
export const runtime = "nodejs";
const schema = z.object({ role: z.enum(["estamparia", "radiador"]), password: z.string().min(1).max(256) });
export async function POST(req: Request) {
  try {
    await guard(req, "auth");
    const value = schema.parse(JSON.parse((await limitedBody(req, 1024)).toString("utf8")));
    if (!verifyCredentials(value.role, value.password)) throw new ApiError("Setor ou senha inválidos.", 401);
    await setSession(value.role);
    return answer({ role: value.role, destination: `/${value.role}` });
  } catch (error) { return failure(error); }
}
