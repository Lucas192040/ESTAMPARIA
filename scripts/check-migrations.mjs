import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const migration = readFileSync("supabase/migrations/20261020174107_alocacoes_e_operacoes_atomicas.sql", "utf8");
const patch = readFileSync("supabase/migrations/20261020193000_corrigir_importacao_ops_repetidas.sql", "utf8");
const server = readFileSync("src/lib/server.ts", "utf8");
for (const sql of [migration, patch]) {
  assert.match(sql, /SELECT DISTINCT ON \(op_pai\)/);
  assert.match(sql, /ORDER BY op_pai,data_programada,serie_inicial/);
  assert.match(sql, /ON CONFLICT\(op_pai\) DO UPDATE/);
  assert.match(sql, /DELETE FROM public\.est_programacoes/);
  assert.match(sql, /ORDER BY data_programada,serie_inicial,id ROWS BETWEEN/);
  assert.match(sql, /COUNT\(DISTINCT \(referencia_prod,potencia_pa,linha_prod,nome_cliente,qtd_op_pai\)\)>1/);
}
assert.match(patch, /CREATE OR REPLACE FUNCTION public\.est_importar/);
assert.doesNotMatch(patch, /\b(?:DROP|TRUNCATE)\s+(?:TABLE|public\.)/i);
assert.match(server, /message: error\.message/);
assert.match(server, /details: error\.details/);
console.log("OK — estrutura da função corrigida, regras FIFO e diagnóstico de erros presentes.");
