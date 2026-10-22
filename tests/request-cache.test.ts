import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequestCache } from "../src/lib/request-cache";

test("requisições simultâneas reutilizam uma única leitura", async () => {
  let calls = 0;
  let release!: (value: number) => void;
  const cache = createRequestCache(() => {
    calls++;
    return new Promise<number>((resolve) => { release = resolve; });
  }, { ttlMs: 30000, failureCooldownMs: 1000 });
  const p1 = cache.get();
  const p2 = cache.get();
  assert.equal(calls, 1);
  release(5);
  assert.deepEqual(await Promise.all([p1, p2]), [5, 5]);
  assert.equal(await cache.get(), 5);
  assert.equal(calls, 1);
});

test("TTL e invalidação liberam a próxima leitura", async () => {
  let now = 0;
  let calls = 0;
  const cache = createRequestCache(async () => ++calls, {
    ttlMs: 30000, failureCooldownMs: 1000, now: () => now,
  });
  assert.equal(await cache.get(), 1);
  now = 29000;
  assert.equal(await cache.get(), 1);
  now = 30001;
  assert.equal(await cache.get(), 2);
  cache.invalidate();
  assert.equal(await cache.get(), 3);
});

test("falha temporária não gera tempestade de retentativas", async () => {
  let now = 0;
  let calls = 0;
  const cache = createRequestCache(async () => {
    calls++;
    if (calls === 1) throw new Error("indisponível");
    return "ok";
  }, { ttlMs: 30000, failureCooldownMs: 15000, now: () => now });
  await assert.rejects(cache.get(), /indisponível/);
  await assert.rejects(cache.get(), /indisponível/);
  assert.equal(calls, 1);
  now = 15001;
  assert.equal(await cache.get(), "ok");
  assert.equal(calls, 2);
});

test("resultado de leitura invalidada durante execução nunca fica em cache", async () => {
  let resolveFirst!: (value: string) => void;
  let calls = 0;
  const cache = createRequestCache(async () => {
    calls++;
    if (calls === 1) return new Promise<string>((resolve) => { resolveFirst = resolve; });
    return "novo";
  }, { ttlMs: 30000, failureCooldownMs: 15000 });
  const inFlight = cache.get();
  cache.invalidate();
  assert.equal(await cache.get(), "novo");
  resolveFirst("antigo");
  assert.equal(await inFlight, "antigo");
  assert.equal(await cache.get(), "novo");
  assert.equal(calls, 2);
});
