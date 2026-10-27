import "server-only";
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ApiError } from "./server";

export type Role = "estamparia" | "radiador";
const COOKIE = "itam_sector_session";
const MAX_AGE = 12 * 60 * 60;

function secret() {
  const value = process.env.AUTH_SESSION_SECRET || process.env.DATABASE_URL;
  if (!value || value.length < 32) throw new ApiError("Configure AUTH_SESSION_SECRET no servidor.", 503);
  // Domain separation; a dedicated AUTH_SESSION_SECRET is strongly recommended.
  return createHash("sha256").update("itam-sector-session-v1:" + value).digest();
}
function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}
export function verifyCredentials(role: string, password: string): role is Role {
  if (role !== "estamparia" && role !== "radiador") return false;
  const expected = role === "estamparia"
    ? process.env.ESTAMPARIA_PASSWORD || "estamp123"
    : process.env.RADIADOR_PASSWORD || "rad123";
  // Fixed-sized HMAC prevents timing discrepancies for distinct password lengths.
  return timingSafeEqual(
    createHmac("sha256", secret()).update(password).digest(),
    createHmac("sha256", secret()).update(expected).digest(),
  );
}
export function createSession(role: Role): string {
  const payload = Buffer.from(JSON.stringify({ role, expires: Date.now() + MAX_AGE * 1000, nonce: randomBytes(12).toString("hex") })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readSession(token?: string): Role | null {
  if (!token || token.length > 1024) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra) return null;
  const expected = signature(payload);
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || typeof data !== "object") return null;
    const value = data as { role?: string; expires?: number };
    if (typeof value.expires !== "number" || !Number.isFinite(value.expires) || value.expires <= Date.now()) return null;
    return value.role === "estamparia" || value.role === "radiador" ? value.role : null;
  } catch { return null; }
}
export async function currentRole(): Promise<Role | null> {
  return readSession((await cookies()).get(COOKIE)?.value);
}
export async function requireRole(role?: Role): Promise<Role> {
  const current = await currentRole();
  if (!current) throw new ApiError("Faça login para acessar o sistema.", 401);
  if (role && current !== role) throw new ApiError("Acesso restrito ao setor autorizado.", 403);
  return current;
}
export async function setSession(role: Role) {
  (await cookies()).set(COOKIE, createSession(role), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}
export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
