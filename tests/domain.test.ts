import test from "node:test";
import assert from "node:assert/strict";
import { manausDate, statusOf } from "../src/lib/domain";
import type { Schedule } from "../src/lib/types";
const day = (date: string, values = [0, 0, 0, 0]): Schedule => ({
  id: 1,
  data_programada: date,
  qtd_programada: 50,
  serie_inicial: 1,
  serie_final: 50,
  setores: values.map((q, i) => ({
    subsetor_id: i + 1,
    qtd_apontada: q,
    versao: 0,
  })),
});
test("Fuso Manaus: antes/depois da meia-noite", () => {
  assert.equal(manausDate(new Date("2026-10-20T03:59:59Z")), "2026-10-19");
  assert.equal(manausDate(new Date("2026-10-20T04:00:00Z")), "2026-10-20");
});
test("Prioridade de situação: concluída, atrasada, não iniciada, andamento", () => {
  assert.equal(
    statusOf([day("2026-10-19", [50, 50, 50, 50])], "2026-10-20"),
    "CONCLUIDA",
  );
  assert.equal(statusOf([day("2026-10-19")], "2026-10-20"), "ATRASADA");
  assert.equal(statusOf([day("2026-10-20")], "2026-10-20"), "NAO_INICIADA");
  assert.equal(
    statusOf([day("2026-10-20", [1, 0, 0, 0])], "2026-10-20"),
    "EM_ANDAMENTO",
  );
  assert.equal(
    statusOf(
      [day("2026-10-19", [50, 50, 40, 50]), day("2026-10-21")],
      "2026-10-20",
    ),
    "ATRASADA",
  );
});
