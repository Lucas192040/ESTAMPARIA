// Integration of actual Next handlers + Supabase client + real SQL, with HTTP transport isolated.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { GET as health } from "../src/app/api/health/route";
import { GET as ops } from "../src/app/api/ops/route";
import { POST as importer } from "../src/app/api/import/route";
import { POST as production } from "../src/app/api/production/route";
const database = new PGlite();
await database.exec(
  "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
);
await database.exec(readFileSync("sql/estrutura-original.sql", "utf8"));
for (const name of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
  await database.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
}
const originalFetch = globalThis.fetch,
  origin = "http://localhost:3000",
  results: string[] = [];
let limiterCalls = 0;
const names: Record<string, string[]> = {
  est_listar: ["p_filters"],
  est_limitar: ["p_chave", "p_max"],
  est_previa_importacao: ["p_ops"],
  est_importar: ["p_rows", "p_nome", "p_revision", "p_request"],
  est_registrar: [
    "p_request",
    "p_programacao",
    "p_subsetor",
    "p_quantidade",
    "p_modo",
    "p_versao",
    "p_observacao",
  ],
};
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  assert.ok(url.startsWith("https://isolated-test.supabase.co/rest/v1/rpc/"));
  const name = url.split("/").at(-1)!;
  assert.ok(names[name]);
  if (name === "est_limitar") limiterCalls++;
  const payload = JSON.parse(String(init?.body));
  const values = names[name].map((key) => {
    const v = payload[key];
    return typeof v === "object" ? JSON.stringify(v) : v;
  });
  try {
    const result = (
      await database.query<{ result: unknown }>(
        `select ${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
        values,
      )
    ).rows[0].result;
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const err = e as Error & { code: string };
    return new Response(
      JSON.stringify({ message: err.message, code: err.code }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
};
const get = (path: string) => new Request(origin + path);
const body = (path: string, data: unknown) =>
  new Request(origin + path, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
let file: Buffer;
if (process.env.EXCEL_PATH) file = readFileSync(process.env.EXCEL_PATH);
else {
  const b = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    b,
    XLSX.utils.aoa_to_sheet([
      [
        "OP-Pai",
        "Referência Prod.",
        "Potência PA",
        "Linha Prod",
        "Nome Cliente",
        "Qtd.OP-Pai",
        "Dt.Programada",
        "Qtd.Programada",
        "Série Inicial",
        "Série Final",
      ],
      ["API-TEST", "REF", "15kva", "MON", "Teste", 50, "20/10/2030", 50, 1, 50],
    ]),
    "Dados",
  );
  file = XLSX.write(b, { type: "buffer", bookType: "xlsx" });
}
function upload(action: string, more: Record<string, string> = {}) {
  const form = new FormData();
  form.append(
    "file",
    new File(
      [new Uint8Array(file)],
      process.env.EXCEL_PATH ? "arquivo.xls" : "teste.xlsx",
    ),
  );
  form.append("action", action);
  for (const [k, v] of Object.entries(more)) form.append(k, v);
  return new Request(origin + "/api/import", {
    method: "POST",
    headers: { origin },
    body: form,
  });
}
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  results.push(name);
  console.log("PASS", name);
}
try {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.APP_ORIGIN = origin;
  await test("API sem credenciais: conexão pendente e validação do arquivo disponível", async () => {
    assert.equal(
      (await (await health(get("/api/health"))).json()).connected,
      false,
    );
    const p = await importer(upload("preview"));
    assert.equal(p.status, 200, await p.clone().text());
    assert.equal((await p.json()).database, null);
  });
  process.env.SUPABASE_URL = "https://isolated-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-server-only-key";
  await test("API conectada ao transporte de testes consulta SQL", async () => {
    assert.equal(
      (await (await health(get("/api/health"))).json()).connected,
      true,
    );
    assert.equal((await (await ops(get("/api/ops"))).json()).total, 0);
    assert.equal(limiterCalls, 0, "GET não deve depender do RPC est_limitar");
  });
  let prev: any;
  await test("Prévia e confirmação usam o mesmo arquivo; importação real no motor isolado", async () => {
    const r = await importer(upload("preview"));
    assert.equal(r.status, 200);
    prev = await r.json();
    const c = await importer(
      upload("confirm", {
        revision: String(prev.database.revision),
        hash: prev.hash,
        requestId: randomUUID(),
      }),
    );
    assert.equal(c.status, 200);
    const all = await (await ops(get("/api/ops"))).json();
    assert.equal(all.total, prev.ops);
  });
  let prog: any;
  await test("Apontamento HTTP, edição e idempotência chegam ao SQL", async () => {
    const all = await (await ops(get("/api/ops"))).json();
    prog = all.items[0].programacoes[0];
    const payload = {
      requestId: randomUUID(),
      programacao: prog.id,
      subsetor: 1,
      quantidade: 1,
      modo: "adicionar",
      versao: 0,
    };
    let r = await production(body("/api/production", payload));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).quantidade, 1);
    assert.ok(limiterCalls > 0, "POST deve manter o limite distribuído no banco");
    r = await production(body("/api/production", payload));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).quantidade, 1);
    r = await production(
      body("/api/production", {
        ...payload,
        requestId: randomUUID(),
        modo: "corrigir",
        quantidade: 0,
        versao: 1,
      }),
    );
    assert.equal(r.status, 200);
    assert.equal((await r.json()).quantidade, 0);
  });
  await test("Backend rejeita saldo excedido, versão antiga e entrada inválida", async () => {
    const valid = {
      requestId: randomUUID(),
      programacao: prog.id,
      subsetor: 1,
      quantidade: prog.qtd_programada + 1,
      modo: "adicionar",
      versao: 2,
    };
    assert.equal(
      (await production(body("/api/production", valid))).status,
      422,
    );
    assert.equal(
      (
        await production(
          body("/api/production", { ...valid, quantidade: 1, versao: 0 }),
        )
      ).status,
      409,
    );
    assert.equal(
      (await production(body("/api/production", { ...valid, quantidade: -1 })))
        .status,
      422,
    );
    assert.equal((await ops(get("/api/ops?serie=abc"))).status, 422);
  });
  await test("Origem estrangeira, arquivo alterado e corpo muito grande bloqueados", async () => {
    assert.equal(
      (
        await production(
          new Request(origin + "/api/production", {
            method: "POST",
            headers: { origin: "https://foreign.example" },
            body: "{}",
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await importer(
          upload("confirm", {
            revision: String(prev.database.revision),
            hash: "alterado",
            requestId: randomUUID(),
          }),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await production(
          new Request(origin + "/api/production", {
            method: "POST",
            headers: { origin },
            body: "x".repeat(9000),
          }),
        )
      ).status,
      413,
    );
  });
  await test("Serialização ao navegador não contém chave administrativa", async () => {
    const text = await (await ops(get("/api/ops"))).text();
    assert.ok(!text.includes("test-server-only-key"));
  });
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  await database.close();
  writeFileSync(
    "docs/api-results.json",
    JSON.stringify(
      {
        transport:
          "HTTP Supabase interceptado em teste; handlers, cliente e SQL reais executados",
        passed: results,
        remoteSupabaseTested: false,
      },
      null,
      2,
    ) + "\n",
  );
}
