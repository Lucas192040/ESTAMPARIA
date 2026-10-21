import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseExcel } from "../src/lib/importer";
import type { ImportRow, Listing } from "../src/lib/types";
const db = new PGlite();
const results: { test: string; status: string }[] = [];
await db.exec(
  "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
);
await db.exec(readFileSync("sql/estrutura-original.sql", "utf8"));
// Verify migration preserves an existing legacy historical total.
await db.exec(
  "INSERT INTO est_ops(op_pai,qtd_op_pai) VALUES('LEGACY',50); INSERT INTO est_programacoes(op_id,data_programada,qtd_programada,serie_inicial,serie_final) SELECT id,'2020-01-01',50,1,50 FROM est_ops; INSERT INTO est_apontamentos(op_id,subsetor_id,quantidade) SELECT id,1,20 FROM est_ops;",
);
for (const name of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
}
async function query<T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
) {
  return (await db.query<T>(sql, args)).rows;
}
async function rpc<T = any>(name: string, args: unknown[] = []): Promise<T> {
  const row = await query<{ result: T }>(
    `select ${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
    args.map((a) =>
      a !== null && typeof a === "object" ? JSON.stringify(a) : a,
    ),
  );
  return row[0].result;
}
const row = (
  op = "100",
  qty = 50,
  date = "2030-10-20",
  start = 1001,
  total = qty,
): ImportRow => ({
  op_pai: op,
  referencia_prod: "TEST-REF",
  potencia_pa: 37.5,
  linha_prod: "MON",
  nome_cliente: "CLIENTE TESTE ISOLADO",
  qtd_op_pai: total,
  data_programada: date,
  qtd_programada: qty,
  serie_inicial: start,
  serie_final: start + qty - 1,
});
async function imp(rows: ImportRow[], request = randomUUID()) {
  const rev = (
    await query<{ revisao: number }>("select revisao from est_estado")
  )[0].revisao;
  return rpc("est_importar", [rows, "teste.xlsx", Number(rev), request]);
}
async function list(f: object = {}): Promise<Listing> {
  return rpc("est_listar", [f]);
}
async function save(
  op: string,
  day: number,
  sector: number,
  qty: number,
  mode = "adicionar",
  req = randomUUID(),
) {
  const o = (await list({ op })).items.find((o) => o.op_pai === op)!;
  const p = o.programacoes[day],
    s = p.setores.find((s) => s.subsetor_id === sector)!;
  return rpc("est_registrar", [
    req,
    p.id,
    sector,
    qty,
    mode,
    s.versao,
    "Teste isolado",
  ]);
}
async function amount(op = "100", day = 0, sector = 1) {
  return (await list({ op })).items
    .find((o) => o.op_pai === op)!
    .programacoes[day].setores.find((s) => s.subsetor_id === sector)!
    .qtd_apontada;
}
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ test: name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ test: name, status: "FAIL" });
    console.error("FAIL", name, e);
    throw e;
  }
}
try {
  await test("Migração preserva 20 unidades históricas existentes", async () =>
    assert.equal(await amount("LEGACY"), 20));
  await test("01 Apontamento parcial 20 + 15 = 35", async () => {
    await imp([row()]);
    await save("100", 0, 1, 20);
    await save("100", 0, 1, 15);
    assert.equal(await amount(), 35);
  });
  await test("REGRESSÃO: sete datas da mesma OP geram somente uma OP", async () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row("OP-DIVIDIDA", 10, `2030-11-${String(i + 1).padStart(2, "0")}`, 5001 + i * 10, 70),
    );
    await imp(rows);
    const ops = await query<{ quantidade: number }>(
      "SELECT count(*)::integer AS quantidade FROM est_ops WHERE op_pai='OP-DIVIDIDA'",
    );
    const blocks = await query<{ quantidade: number }>(
      "SELECT count(*)::integer AS quantidade FROM est_programacoes WHERE op_id=(SELECT id FROM est_ops WHERE op_pai='OP-DIVIDIDA')",
    );
    assert.equal(Number(ops[0].quantidade), 1);
    assert.equal(Number(blocks[0].quantidade), 7);
    assert.equal((await list({ op: "OP-DIVIDIDA" })).items[0].programacoes.length, 7);
  });
  await test("02 Limite: 20 + 10 em programação de 25 bloqueado", async () => {
    await imp([row("200", 25)]);
    await save("200", 0, 3, 20);
    await assert.rejects(save("200", 0, 3, 10), /Saldo disponível: 5/);
    assert.equal(await amount("200", 0, 3), 20);
  });
  await test("03 Data anterior preservada e timestamp real", async () => {
    await imp([row("300", 50, "2020-01-01")]);
    const before = Date.now();
    await save("300", 0, 1, 10);
    const h = (
      await query<{ d: string; t: Date }>(
        "select data_programada_original::text as d,registrado_em as t from est_apontamentos order by id desc limit 1",
      )
    )[0];
    assert.equal(h.d, "2020-01-01");
    assert.ok(new Date(h.t).getTime() >= before - 1000);
  });
  await test("04 Segundo dia recebe lançamento sem mover ao primeiro", async () => {
    await imp([
      row("400", 25, "2030-10-20", 1001, 50),
      row("400", 25, "2030-10-21", 1026, 50),
    ]);
    await save("400", 1, 3, 10);
    assert.equal(await amount("400", 0, 3), 0);
    assert.equal(await amount("400", 1, 3), 10);
  });
  await test("05 FIFO independente nos quatro subsetores", async () => {
    await imp([row("500")]);
    for (const [s, q] of [
      [1, 35],
      [2, 22],
      [3, 15],
      [4, 8],
    ])
      await save("500", 0, s, q);
    await imp(
      Array.from({ length: 5 }, (_, i) =>
        row("500", 10, `2030-10-${20 + i}`, 1001 + i * 10, 50),
      ),
    );
    const p = (await list()).items[0].programacoes;
    assert.deepEqual(
      p.map((p) => p.setores.map((s) => s.qtd_apontada)),
      [
        [10, 10, 10, 8],
        [10, 10, 5, 0],
        [10, 2, 0, 0],
        [5, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    );
  });
  await test("06 Redução 60→40 preserva histórico de 50", async () => {
    await imp([row("600", 60)]);
    await save("600", 0, 3, 50);
    await imp([row("600", 40)]);
    assert.equal(await amount("600", 0, 3), 40);
    assert.equal(
      Number(
        (
          await query<{ qtd_historica: number }>(
            "select qtd_historica from est_totais_subsetores where op_pai='600' and subsetor_id=3",
          )
        )[0].qtd_historica,
      ),
      50,
    );
  });
  await test("15 Aumento posterior restaura excedente válido sem duplicar", async () => {
    await imp([row("600", 60)]);
    assert.equal(await amount("600", 0, 3), 50);
    await imp([row("600", 60)]);
    assert.equal(await amount("600", 0, 3), 50);
  });
  await test("14 Redução, correção e aumento sem excedente indevido", async () => {
    await imp([row("600", 40)]);
    await save("600", 0, 3, 35, "corrigir");
    assert.equal(await amount("600", 0, 3), 35);
    await save("600", 0, 3, 3);
    assert.equal(await amount("600", 0, 3), 38);
    await imp([row("600", 60)]);
    assert.equal(await amount("600", 0, 3), 38);
  });
  await test("07 OP ausente exclui histórico em cascata", async () => {
    await imp([row("700")]);
    assert.equal((await query("select * from est_apontamentos")).length, 0);
    assert.equal(
      (await query("select * from est_ops where op_pai='600'")).length,
      0,
    );
  });
  await test("08 Alteração de datas preserva produção", async () => {
    await save("700", 0, 1, 8);
    await save("700", 0, 3, 5);
    await imp([row("700", 50, "2030-11-10")]);
    assert.equal(await amount("700", 0, 1), 8);
    assert.equal(await amount("700", 0, 3), 5);
  });
  await test("09 Correção 20→15 e limite zero", async () => {
    await save("700", 0, 2, 20);
    await save("700", 0, 2, 15, "corrigir");
    assert.equal(await amount("700", 0, 2), 15);
    await assert.rejects(save("700", 0, 2, -1, "corrigir"));
    await assert.rejects(save("700", 0, 2, 51, "corrigir"));
  });
  await test("10 Situação atrasada com apenas TAMPA pendente", async () => {
    await imp([row("800", 50, "2020-01-01")]);
    for (const s of [1, 2, 4]) await save("800", 0, s, 50);
    await save("800", 0, 3, 40);
    assert.equal((await list()).items[0].situacao, "ATRASADA");
    await save("800", 0, 3, 10);
    assert.equal((await list()).items[0].situacao, "CONCLUIDA");
  });
  await test("11 Programação parcial 60/90 aceita", async () => {
    await imp([row("900", 60, "2030-10-20", 1001, 90)]);
    assert.equal((await list()).items[0].qtd_programada, 60);
  });
  await test("12 Erro durante inserção reverte exclusão e dados anteriores", async () => {
    const before = JSON.stringify(await list());
    await db.exec(
      "CREATE FUNCTION public.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.serie_inicial=999999 THEN RAISE EXCEPTION 'Falha injetada depois das exclusões'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_fail BEFORE INSERT ON est_programacoes FOR EACH ROW EXECUTE FUNCTION test_fail();",
    );
    await assert.rejects(
      imp([row("FAIL", 50, "2030-01-01", 999999)]),
      /Falha injetada/,
    );
    assert.equal(JSON.stringify(await list()), before);
    await db.exec(
      "DROP TRIGGER test_fail ON est_programacoes; DROP FUNCTION public.test_fail();",
    );
  });
  await test("13a Chamadas concorrentes no motor serializado rejeitam versão obsoleta", async () => {
    await imp([row("1000", 25)]);
    const p = (await list()).items[0].programacoes[0];
    const args = [p.id, 1, 20, "adicionar", 0, ""];
    const res = await Promise.allSettled([
      rpc("est_registrar", [randomUUID(), ...args]),
      rpc("est_registrar", [randomUUID(), ...args]),
    ]);
    assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await amount("1000"), 20);
  });
  await test("13b Retry com a mesma chave não duplica apontamento", async () => {
    const p = (await list()).items[0].programacoes[0];
    const args = [randomUUID(), p.id, 2, 10, "adicionar", 0, ""];
    const a = await rpc("est_registrar", args),
      b = await rpc("est_registrar", args);
    assert.deepEqual(a, b);
    assert.equal(await amount("1000", 0, 2), 10);
    await assert.rejects(
      rpc("est_registrar", [args[0], p.id, 2, 11, "adicionar", 0, ""]),
      /Identificador/,
    );
  });
  await test("Importação rejeita prévia obsoleta e reaplica retry uma vez", async () => {
    const rev = Number(
      (await query<{ revisao: number }>("select revisao from est_estado"))[0]
        .revisao,
    );
    await save("1000", 0, 4, 1);
    await assert.rejects(
      rpc("est_importar", [[row("1000")], "teste", rev, randomUUID()]),
      /produção mudou/,
    );
    const newrev = Number(
      (await query<{ revisao: number }>("select revisao from est_estado"))[0]
        .revisao,
    );
    const args = [[row("1000")], "teste", newrev, randomUUID()];
    assert.deepEqual(
      await rpc("est_importar", args),
      await rpc("est_importar", args),
    );
  });
  await test("Séries inclusivas, lacunas e filtros combinados", async () => {
    await imp([
      row("1100", 10, "2030-10-20", 1001, 30),
      row("1100", 10, "2030-10-21", 1021, 30),
      row("1200", 10, "2030-10-20", 2001),
    ]);
    for (const serie of ["1001", "1010", "1021", "1030"])
      assert.equal((await list({ serie })).total, 1);
    assert.equal((await list({ serie: "1011" })).total, 0);
    assert.equal(
      (
        await list({
          q: "1025",
          op: "1100",
          cliente: "CLIENTE TESTE ISOLADO",
          potencia: "37.5",
          linha: "MON",
          inicio: "2030-10-21",
          fim: "2030-10-21",
        })
      ).total,
      1,
    );
    assert.equal(
      (await list({ serie: "1001", inicio: "2030-10-21" })).total,
      0,
    );
  });
  await test("Validação SQL rejeita duplicidade e mantém estado", async () => {
    const before = JSON.stringify(await list());
    await assert.rejects(
      imp([row(), row()]),
      /quantidade|sobrepostas|inconsistentes/,
    );
    assert.equal(JSON.stringify(await list()), before);
  });
  await test("Segurança: anon sem leitura ou execução; service_role autorizado", async () => {
    await db.exec("SET ROLE anon");
    await assert.rejects(query("select * from est_ops"), /permission denied/);
    await assert.rejects(rpc("est_listar", [{}]), /permission denied/);
    await db.exec("RESET ROLE; SET ROLE service_role;");
    assert.ok((await list()).total > 0);
    await db.exec("RESET ROLE");
    const r = await query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname like 'est_%' and relkind='r'",
    );
    assert.ok(r.every((t) => t.relrowsecurity));
  });
  await test("Rate limit compartilhado no banco", async () => {
    assert.equal(await rpc("est_limitar", ["test-key", 2]), true);
    assert.equal(await rpc("est_limitar", ["test-key", 2]), true);
    assert.equal(await rpc("est_limitar", ["test-key", 2]), false);
  });
  const real = process.env.EXCEL_PATH;
  if (real)
    await test("Excel real: 115 linhas, 84 OPs, 2663 unidades no SQL", async () => {
      const parsed = parseExcel(readFileSync(real), "arquivo.xls");
      await imp(parsed.rows);
      const all = await list();
      assert.equal(all.total, 84);
      assert.equal(all.items.length, 12);
      assert.equal(all.paginas, 7);
      const sum = (
        await query<{ n: number }>(
          "select sum(qtd_programada) as n from est_programacoes",
        )
      )[0].n;
      assert.equal(Number(sum), 2663);
      assert.equal((await list({ op: "43107" })).items[0].qtd_programada, 60);
    });
} catch {
  process.exitCode = 1;
} finally {
  await db.close();
  writeFileSync(
    "docs/database-results.json",
    JSON.stringify(
      {
        engine: "PGlite (PostgreSQL embutido, sessão única)",
        results,
        limitations: [
          "Concorrência entre sessões PostgreSQL independentes não executada neste ambiente.",
          "Supabase remoto e PostgREST reais não conectados.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
