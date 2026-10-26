import assert from "node:assert/strict";
import test from "node:test";
<<<<<<< HEAD
import { executeAtomicBatch, sectorRequestId } from "../src/lib/production-batch.ts";
=======
import { executeAtomicBatch, sectorRequestId } from "../src/lib/production-batch";
>>>>>>> 448c87a (AJUSTE PERFORMACE2.0)

const requestId = "b48d78c8-93cc-4471-a4aa-728ca52a8ec1";
const payload = {
  requestId, programacao: 111, modo: "adicionar" as const,
  observacao: "Produção da estamparia",
  apontamentos: [
    { subsetor: 1, quantidade: 10, versao: 2 },
    { subsetor: 3, quantidade: 7, versao: 0 },
    { subsetor: 4, quantidade: 8, versao: 1 },
  ],
};

test("IDs per-sector are valid and stable across request retries", () => {
  const first = sectorRequestId(requestId, 1);
  assert.match(first, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(sectorRequestId(requestId, 1), first);
  assert.notEqual(sectorRequestId(requestId, 3), first);
});

test("records independent quantities and commits exactly once", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const result = await executeAtomicBatch(payload, async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [{ value: { ok: true } }] };
  }, "SELECT est_registrar");
  assert.deepEqual(queries.map((q) => q.sql), ["BEGIN", "SELECT est_registrar", "SELECT est_registrar", "SELECT est_registrar", "COMMIT"]);
  assert.deepEqual(queries.slice(1, 4).map((q) => q.params?.[3]), [10, 7, 8]);
  assert.deepEqual(queries.slice(1, 4).map((q) => q.params?.[2]), [1, 3, 4]);
  assert.equal(result.totalSubsetores, 3);
});

test("rolls back when the second sector fails validation", async () => {
  const calls: string[] = [];
  let count = 0;
  await assert.rejects(executeAtomicBatch(payload, async (sql) => {
    calls.push(sql);
    if (sql === "SELECT est_registrar" && ++count === 2)
      throw Object.assign(new Error("Saldo insuficiente"), { code: "22023" });
    return { rows: [{ value: { ok: true } }] };
  }, "SELECT est_registrar"), /Saldo insuficiente/);
  assert.deepEqual(calls, ["BEGIN", "SELECT est_registrar", "SELECT est_registrar", "ROLLBACK"]);
});

test("does not commit if all four subprocesses cannot be recorded", async () => {
  const all = { ...payload, apontamentos: [
    { subsetor: 1, quantidade: 2, versao: 0 },
    { subsetor: 2, quantidade: 3, versao: 0 },
    { subsetor: 3, quantidade: 4, versao: 0 },
    { subsetor: 4, quantidade: 5, versao: 0 },
  ] };
  const calls: string[] = [];
  const result = await executeAtomicBatch(all, async (sql) => {
    calls.push(sql);
    return { rows: [{ value: true }] };
  }, "SELECT est_registrar");
  assert.equal(result.totalSubsetores, 4);
  assert.equal(calls.filter((sql) => sql === "SELECT est_registrar").length, 4);
});
