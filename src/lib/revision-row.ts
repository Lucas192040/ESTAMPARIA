/** Lê a revisão da programação sem depender da inferência de tipos da resposta PostgREST. */
export function parseRevisionRow(row: unknown): number | null {
  if (typeof row !== "object" || row === null || !("revisao" in row)) return null;
  const raw = row.revisao;
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const revision = Number(raw);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}
