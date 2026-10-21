// Explicitly destructive ONLY inside a disposable test database; never production.
import { Pool } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_estamparia_test") ||
  process.env.ALLOW_TEST_RESET !== "yes"
)
  throw Error(
    "Configure TEST_DATABASE_URL para um banco descartável cujo nome termine em _estamparia_test e ALLOW_TEST_RESET=yes.",
  );
const pool = new Pool({ connectionString: url, max: 4 });
try {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END $$;",
  );
  await pool.query(readFileSync("sql/estrutura-original.sql", "utf8"));
  for (const name of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  const rows = [
    {
      op_pai: "CONCURRENCY",
      referencia_prod: "TEST",
      potencia_pa: 15,
      linha_prod: "MON",
      nome_cliente: "TEST",
      qtd_op_pai: 25,
      qtd_programada: 25,
      data_programada: "2030-01-01",
      serie_inicial: 1,
      serie_final: 25,
    },
  ];
  await pool.query("SELECT est_importar($1,$2,$3,$4)", [
    JSON.stringify(rows),
    "test",
    0,
    randomUUID(),
  ]);
  const p = (await pool.query("select id from est_programacoes")).rows[0].id;
  const sql = "select est_registrar($1,$2,$3::smallint,$4,$5,$6,$7) as r";
  const responses = await Promise.allSettled([
    pool.query(sql, [randomUUID(), p, 1, 20, "adicionar", 0, "A"]),
    pool.query(sql, [randomUUID(), p, 1, 20, "adicionar", 0, "B"]),
  ]);
  assert.equal(responses.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (
      await pool.query(
        "select quantidade from est_alocacoes where subsetor_id=1",
      )
    ).rows[0].quantidade,
    20,
  );
  const id = randomUUID(),
    args = [id, p, 2, 20, "adicionar", 0, "retry"];
  const same = await Promise.all([
    pool.query(sql, args),
    pool.query(sql, args),
  ]);
  assert.deepEqual(same[0].rows, same[1].rows);
  assert.equal(
    (
      await pool.query(
        "select quantidade from est_alocacoes where subsetor_id=2",
      )
    ).rows[0].quantidade,
    20,
  );
  const rev = (await pool.query("select revisao from est_estado")).rows[0]
    .revisao;
  const a = await pool.connect();
  await a.query("BEGIN");
  await a.query(sql, [
    randomUUID(),
    p,
    3,
    5,
    "adicionar",
    0,
    "while importing",
  ]);
  const importing = pool
    .query("SELECT est_importar($1,$2,$3,$4)", [
      JSON.stringify(rows),
      "test",
      rev,
      randomUUID(),
    ])
    .then(
      () => ({ success: true, error: "" }),
      (e) => ({ success: false, error: String(e.message) }),
    );
  await a.query("COMMIT");
  a.release();
  const importResult = await importing;
  assert.equal(importResult.success, false);
  assert.match(importResult.error, /produção mudou/);
  assert.equal(
    (
      await pool.query(
        "select quantidade from est_alocacoes where subsetor_id=3",
      )
    ).rows[0].quantidade,
    5,
  );
  console.log(
    "PASS: conexões independentes, limite, idempotência e disputa entre importação/apontamento.",
  );
} finally {
  await pool.end();
}
