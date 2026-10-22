import assert from "node:assert/strict";
import { test } from "node:test";
import { supabaseFetch, withDbDeadline } from "../src/lib/db-timeout.ts";

test("request-scoped deadline aborts a stalled GET without .abortSignal", async () => {
  const before = globalThis.fetch;
  let called = false;
  try {
    globalThis.fetch = async (_input, init) => {
      called = true;
      assert.ok(init.signal instanceof AbortSignal);
      return new Promise((_resolve, reject) => {
        const keepAlive = setTimeout(() => reject(new Error("Test fallback: request never aborted")), 2_000);
        init.signal.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          reject(init.signal.reason);
        }, { once: true });
      });
    };
    await assert.rejects(withDbDeadline(25, () => supabaseFetch("https://invalid.test/", { method: "GET" })),
      (error) => error?.name === "TimeoutError");
    assert.equal(called, true);
  } finally { globalThis.fetch = before; }
});

test("distinct overlapping calls do not share the same deadline", async () => {
  const originalFetch = globalThis.fetch;
  const observed = [];
  try {
    globalThis.fetch = async (_input, init) => {
      observed.push(init.signal);
      return new Response("ok");
    };
    await Promise.all([
      withDbDeadline(200, () => supabaseFetch("https://invalid.test/a")),
      withDbDeadline(200, () => supabaseFetch("https://invalid.test/b")),
    ]);
    assert.equal(observed.length, 2);
    assert.notEqual(observed[0], observed[1]);
  } finally { globalThis.fetch = originalFetch; }
});

test("caller abort signal is preserved alongside the database deadline", async () => {
  const originalFetch = globalThis.fetch;
  const abort = new AbortController();
  try {
    globalThis.fetch = async (_input, init) => {
      abort.abort();
      assert.equal(init.signal.aborted, true);
      return new Response("ok");
    };
    await withDbDeadline(200, () => supabaseFetch("https://invalid.test", { signal: abort.signal }));
  } finally { globalThis.fetch = originalFetch; }
});
