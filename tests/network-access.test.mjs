// Testes independentes de Supabase e da instalação de pacotes.
import test from "node:test";
import assert from "node:assert/strict";
import { randomFillSync } from "node:crypto";
import { localDevelopmentHosts, isLocalDevelopmentOrigin } from "../src/lib/local-network.ts";
import { newRequestId } from "../src/lib/browser-id.ts";

const internal = "http://0.0.0.0:3000/api/production";
const valid = (origin, url = internal) => isLocalDevelopmentOrigin(origin, url);

test("localhost e 127.0.0.1 aceitos ainda que o Next.js normalize a URL interna", () => {
  assert.equal(valid("http://localhost:3000"), true);
  assert.equal(valid("http://127.0.0.1:3000"), true);
  assert.equal(valid("http://localhost:3000", "http://localhost:3000/api/production"), true);
  assert.equal(valid("http://127.0.0.1:3000", "http://localhost:3000/api/production"), true);
});

test("endereços IP das interfaces de rede do computador são aceitos independentemente do Host interno", () => {
  const ips = localDevelopmentHosts().filter((h) => /^\d+\.\d+\.\d+\.\d+$/.test(h));
  for (const host of ips) {
    assert.equal(valid(`http://${host}:3000`), true, host);
    assert.equal(valid(`http://${host}:3000`, "http://localhost:3000/api/production"), true, host);
    assert.equal(valid(`http://${host}:3000`, `http://${host}:3000/api/import`), true, host);
  }
});

test("origens externas, ausentes ou malformadas são rejeitadas", () => {
  for (const origin of [null, "null", "https://foreign.example", "http://evil.example:3000", "http://0.0.0.0:3000", "http://localhost:3000.evil.example", "http://localhost:3000/path", "http://localhost:3000, http://evil.example", "http://localhost:3001"]) {
    assert.equal(valid(origin), false, String(origin));
  }
});

test("portas diferentes são recusadas; portas alternativas legítimas funcionam", () => {
  assert.equal(valid("http://localhost:3000", "http://0.0.0.0:3001/api/production"), false);
  assert.equal(valid("http://localhost:3100", "http://0.0.0.0:3100/api/production"), true);
});

test("UUID v4 funciona com crypto.getRandomValues sem randomUUID em HTTP", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues(bytes) { return randomFillSync(bytes); } },
  });
  try {
    const ids = Array.from({ length: 100 }, () => newRequestId());
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else delete globalThis.crypto;
  }
});

test("porta efetiva do comando dev prevalece sobre URL interna normalizada", () => {
  const previous = process.env.EST_DEV_PORT;
  process.env.EST_DEV_PORT = "3000";
  try {
    assert.equal(valid("http://localhost:3000", "http://0.0.0.0:80/api/production"), true);
    assert.equal(valid("http://localhost:3001", "http://0.0.0.0:80/api/production"), false);
  } finally {
    if (previous === undefined) delete process.env.EST_DEV_PORT;
    else process.env.EST_DEV_PORT = previous;
  }
});
