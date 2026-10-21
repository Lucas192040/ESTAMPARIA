import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyListing, type StoredOrder, type StoredSchedule, type StoredAllocation } from "../src/lib/daily-listing";
import { EMPTY_FILTERS } from "../src/lib/types";

const orders: StoredOrder[] = [
  { id: 1, op_pai: "43107", referencia_prod: "DTF322009", nome_cliente: "Cliente A", potencia_pa: 75, linha_prod: "TRI", qtd_op_pai: 40 },
  { id: 2, op_pai: "43108", referencia_prod: "DTF322010", nome_cliente: "Cliente B", potencia_pa: 15, linha_prod: "MON", qtd_op_pai: 9 },
];
const rows: StoredSchedule[] = [
  { id: 101, op_id: 1, data_programada: "2026-10-21", qtd_programada: 20, serie_inicial: 100, serie_final: 119 },
  { id: 102, op_id: 1, data_programada: "2026-10-22", qtd_programada: 20, serie_inicial: 120, serie_final: 139 },
  { id: 103, op_id: 2, data_programada: "2026-10-21", qtd_programada: 4, serie_inicial: 200, serie_final: 203 },
  { id: 104, op_id: 2, data_programada: "2026-10-21", qtd_programada: 5, serie_inicial: 204, serie_final: 208 },
];
const allocations: StoredAllocation[] = rows.flatMap((r) => [1, 2, 3, 4].map((s) => ({
  programacao_id: r.id, subsetor_id: s, quantidade: r.id === 101 ? 20 : r.id === 103 ? 4 : 0, versao: 0,
})));
const list = (filters = EMPTY_FILTERS, current = allocations) => dailyListing(orders, rows, current, filters, "2026-10-22", 5, null);

test("OP distribuída em dois dias gera duas entradas, não uma entrada com 40", () => {
  const result = list({ ...EMPTY_FILTERS, op: "43107" });
  assert.equal(result.total, 2);
  assert.deepEqual(result.items.map((r) => [r.data_inicial, r.qtd_programada]), [
    ["2026-10-21", 20], ["2026-10-22", 20],
  ]);
  assert.equal(result.items[0].programacoes[0].id, 101);
  assert.equal(result.items[1].programacoes[0].id, 102);
  assert.equal(result.items[0].programacoes[0].setores[0].qtd_apontada, 20);
});
test("duas faixas no mesmo dia compartilham uma entrada e preservam IDs para o apontamento", () => {
  const result = list({ ...EMPTY_FILTERS, op: "43108" });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].qtd_programada, 9);
  assert.deepEqual(result.items[0].programacoes.map((r) => r.id), [103, 104]);
});
test("status e totais são calculados por data, sem misturar dias da OP", () => {
  const result = list({ ...EMPTY_FILTERS, op: "43107" });
  assert.equal(result.counts.CONCLUIDA, 1);
  assert.equal(result.counts.NAO_INICIADA, 1);
  const concluded = list({ ...EMPTY_FILTERS, op: "43107", situacao: "CONCLUIDA" });
  assert.equal(concluded.total, 1);
  assert.equal(concluded.items[0].data_inicial, "2026-10-21");
});
test("série e datas filtram somente a programação diária correspondente", () => {
  assert.deepEqual(list({ ...EMPTY_FILTERS, serie: "125" }).items.map((r) => r.data_inicial), ["2026-10-22"]);
  assert.deepEqual(list({ ...EMPTY_FILTERS, op: "43107", fim: "2026-10-21" }).items.map((r) => r.data_inicial), ["2026-10-21"]);
  assert.equal(list({ ...EMPTY_FILTERS, q: "105" }).total, 1);
});
test("paginação conta entradas por data, não OPs", () => {
  const rowsMany = Array.from({ length: 14 }, (_, i) => ({ ...rows[0], id: 200 + i, data_programada: `2026-11-${String(i+1).padStart(2, "0")}` }));
  const all = dailyListing(orders, rowsMany, [], EMPTY_FILTERS, "2026-10-22", 1, null);
  assert.equal(all.total, 14);
  assert.equal(all.paginas, 2);
  assert.equal(all.items.length, 12);
  const second = dailyListing(orders, rowsMany, [], { ...EMPTY_FILTERS, pagina: 2 }, "2026-10-22", 1, null);
  assert.equal(second.items.length, 2);
});
