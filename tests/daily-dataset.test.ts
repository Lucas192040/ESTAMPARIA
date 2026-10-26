import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyDataset, dailyListing, filterDailyDataset } from "../src/lib/daily-listing";
import { EMPTY_FILTERS } from "../src/lib/types";

const orders = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  op_pai: `${44001 + i}`,
  referencia_prod: `R${i}`,
  nome_cliente: `Cliente ${i % 4}`,
  potencia_pa: [15, 75][i % 2],
  linha_prod: i % 2 ? "TRI" : "MON",
  qtd_op_pai: 30,
}));
const schedules = Array.from({ length: 60 }, (_, i) => ({
  id: i + 100,
  op_id: i % 25 + 1,
  data_programada: `2026-11-${String(i % 20 + 1).padStart(2, "0")}`,
  qtd_programada: 5,
  serie_inicial: i * 10 + 1000,
  serie_final: i * 10 + 1004,
}));
const allocations = schedules.flatMap((item) => [1, 2, 3, 4].map((sector) => ({
  programacao_id: item.id,
  subsetor_id: sector,
  quantidade: (sector + item.id) % 3 === 0 ? 5 : 0,
  versao: 1,
})));

test("filtros locais produzem os mesmos resultados que a rota antiga", () => {
  const dataset = dailyDataset(orders, schedules, allocations, "2026-11-10", 4, null);
  for (const page of [1, 2, 3]) {
    for (const ordem of ["data_asc", "data_desc", "op_asc", "op_desc", "situacao"] as const) {
      for (const situacao of ["", "CONCLUIDA", "ATRASADA", "NAO_INICIADA", "EM_ANDAMENTO"]) {
        const filters = { ...EMPTY_FILTERS, pagina: page, ordem, situacao };
        const actual = filterDailyDataset(dataset, filters);
        const previous = dailyListing(orders, schedules, allocations, filters, "2026-11-10", 4, null);
        assert.deepEqual(actual, previous);
      }
    }
  }
});

test("navegação/filtros não alteram o conjunto de programação ou as versões", () => {
  const dataset = dailyDataset(orders, schedules, allocations, "2026-11-10", 4, null);
  const before = JSON.stringify(dataset);
  filterDailyDataset(dataset, { ...EMPTY_FILTERS, ordem: "op_desc", op: "4400", pagina: 2 });
  filterDailyDataset(dataset, { ...EMPTY_FILTERS, ordem: "data_desc", q: "Cliente" });
  assert.equal(JSON.stringify(dataset), before);
});
