import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyDataset, filterDailyDataset } from "../src/lib/daily-listing";
import { EMPTY_FILTERS } from "../src/lib/types";

const orders = [{ id: 1, op_pai: "43202", referencia_prod: "TESTE", nome_cliente: "Cliente", potencia_pa: 75, linha_prod: "TRI", qtd_op_pai: 10 }];
const schedules = [{ id: 45, op_id: 1, data_programada: "2026-10-25", qtd_programada: 10, serie_inicial: 100, serie_final: 109 }];
const allocations = [1, 2, 3, 4].map((subsetor_id) => ({ programacao_id: 45, subsetor_id, quantidade: 10, versao: 1 }));

test("Radiador tem status independente da Estamparia e não interfere na conclusão", () => {
  const dataset = dailyDataset(orders, schedules, allocations, "2026-10-27", 1, null, [{ programacao_id: 45, quantidade: 4, versao: 2 }]);
  assert.equal(filterDailyDataset(dataset, EMPTY_FILTERS).items[0].situacao, "CONCLUIDA");
  assert.equal(filterDailyDataset(dataset, EMPTY_FILTERS, "radiador").items[0].situacao, "ATRASADA");
  assert.equal(filterDailyDataset(dataset, { ...EMPTY_FILTERS, situacao: "CONCLUIDA" }, "radiador").total, 0);
  assert.equal(dataset.rows[0].programacoes[0].radiador?.qtd_apontada, 4);
  assert.equal(dataset.rows[0].programacoes[0].setores.length, 4);
});

test("Radiador conclui somente quando todas as suas unidades estão completas", () => {
  const dataset = dailyDataset(orders, schedules, allocations, "2026-10-27", 1, null, [{ programacao_id: 45, quantidade: 10, versao: 3 }]);
  assert.equal(filterDailyDataset(dataset, EMPTY_FILTERS, "radiador").items[0].situacao, "CONCLUIDA");
});

test("Sem apontamento, Radiador não iniciado; o dia futuro não está atrasado", () => {
  const dataset = dailyDataset(orders, schedules, allocations, "2026-10-24", 1, null);
  assert.equal(filterDailyDataset(dataset, EMPTY_FILTERS, "radiador").items[0].situacao, "NAO_INICIADA");
});
