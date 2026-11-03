import "server-only";
import { Pool } from "pg";
import { ApiError } from "./server";
let pool: Pool | undefined;
export function ferragemDb() {
  const url = process.env.FERRAGEM_DATABASE_URL;
  if (!url) throw new ApiError("Banco isolado da Ferragem não configurado neste ambiente.",503);
  if (!pool) pool = new Pool({ connectionString:url, max:2, idleTimeoutMillis:10000, connectionTimeoutMillis:7000, allowExitOnIdle:true });
  return pool;
}