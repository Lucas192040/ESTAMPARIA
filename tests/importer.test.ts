import test from "node:test";
import assert from "node:assert/strict";
import * as X from "xlsx";
import {
  parseExcel,
  excelDate,
  power,
  MAX_FILE_SIZE,
} from "../src/lib/importer";
const headers = [
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
];
const valid = [
  "000123",
  "REF-01",
  "37,5kVA",
  "MON",
  "Cliente de teste",
  50,
  "20/10/2030",
  50,
  1001,
  1050,
];
function excel(
  rows: unknown[][] = [valid],
  type: "xls" | "xlsx" = "xlsx",
  head = headers,
) {
  const b = X.utils.book_new();
  X.utils.book_append_sheet(
    b,
    X.utils.aoa_to_sheet([["Título"], [], head, ...rows]),
    "Dados",
  );
  return X.write(b, {
    type: "buffer",
    bookType: type === "xls" ? "biff8" : "xlsx",
  });
}
test("XLS e XLSX: cabeçalho na linha 3 e códigos preservados", () => {
  for (const format of ["xls", "xlsx"] as const) {
    const p = parseExcel(excel([valid], format), `teste.${format}`);
    assert.equal(p.preview.headerRow, 3);
    assert.equal(p.rows[0].op_pai, "000123");
    assert.equal(p.rows[0].potencia_pa, 37.5);
  }
});
test("Cabeçalho em outra ordem e com espaços", () => {
  const p = parseExcel(
    excel(
      [[...valid].reverse()],
      "xlsx",
      [...headers].reverse().map((h) => " " + h + " "),
    ),
    "teste.xlsx",
  );
  assert.equal(p.rows[0].serie_final, 1050);
});
test("Datas Excel 1900/1904 e datas impossíveis", () => {
  assert.equal(excelDate(46296), "2026-10-01");
  assert.equal(excelDate(1, true), "1904-01-02");
  assert.throws(() => excelDate("31/02/2030"));
  assert.throws(() => excelDate(60));
});
test("Potência aceita unidade e descrição; sem alterar 112,5", () => {
  assert.equal(power("15kva (monofásico)"), 15);
  assert.equal(power("112,5kVA"), 112.5);
  assert.equal(power("37.5kVA"), 37.5);
  assert.throws(() => power("15 e 25kVA"));
});
test("Programação parcial aceita e total OP não somado", () => {
  const p = parseExcel(
    excel([
      ["A", ...valid.slice(1, 5), 90, "20/10/2030", 30, 1001, 1030],
      ["A", ...valid.slice(1, 5), 90, "21/10/2030", 30, 1031, 1060],
    ]),
    "t.xlsx",
  );
  assert.equal(p.preview.units, 60);
  assert.equal(p.preview.ops, 1);
  assert.equal(p.preview.warnings.length, 1);
});
test("Duplicatas e intervalos sobrepostos bloqueados", () => {
  assert.throws(
    () => parseExcel(excel([valid, valid]), "t.xlsx"),
    /sobrepostas/,
  );
  const other = [...valid];
  other[8] = 1020;
  other[9] = 1069;
  assert.throws(
    () => parseExcel(excel([valid, other]), "t.xlsx"),
    /sobrepostas/,
  );
});
test("Dados contraditórios e intervalo inválido bloqueados", () => {
  const other = [...valid];
  other[4] = "Outro";
  assert.throws(
    () => parseExcel(excel([valid, other]), "t.xlsx"),
    /inconsistentes/,
  );
  other[4] = valid[4];
  other[9] = 999;
  assert.throws(() => parseExcel(excel([other]), "t.xlsx"), /Intervalo/);
});
test("Qtd brasileira textual 1.000 e formatos numéricos de OP", () => {
  const v = [...valid];
  v[5] = "1.000";
  v[7] = "1.000";
  v[8] = "332.001";
  v[9] = "333.000";
  assert.equal(parseExcel(excel([v]), "t.xlsx").rows[0].qtd_programada, 1000);
  const b = X.utils.book_new(),
    s = X.utils.aoa_to_sheet([headers, [123, ...valid.slice(1)]]);
  s.A2.z = "000000";
  X.utils.book_append_sheet(b, s, "Dados");
  assert.equal(
    parseExcel(X.write(b, { type: "buffer", bookType: "xlsx" }), "t.xlsx")
      .rows[0].op_pai,
    "000123",
  );
});
test("Arquivo inválido, vazio, grande e fórmula não são aceitos", () => {
  assert.throws(() => parseExcel(Buffer.from("abc"), "t.xlsx"));
  assert.throws(() => parseExcel(excel([]), "t.xlsx"), /Nenhuma/);
  assert.throws(
    () => parseExcel(Buffer.alloc(MAX_FILE_SIZE + 1), "t.xls"),
    /4 MB/,
  );
  const b = X.utils.book_new(),
    s = X.utils.aoa_to_sheet([headers, valid]);
  s.H2.f = "25+25";
  X.utils.book_append_sheet(b, s, "Dados");
  assert.throws(
    () =>
      parseExcel(X.write(b, { type: "buffer", bookType: "xlsx" }), "t.xlsx"),
    /Fórmulas/,
  );
});
test("Campos ausentes, cabeçalho duplicado e múltiplas abas rejeitados", () => {
  assert.throws(
    () =>
      parseExcel(excel([valid], "xlsx", ["X", ...headers.slice(1)]), "t.xlsx"),
    /Cabeçalho/,
  );
  assert.throws(
    () =>
      parseExcel(
        excel([[...valid, "A"]], "xlsx", [...headers, headers[0]]),
        "t.xlsx",
      ),
    /repetidas/,
  );
  const b = X.utils.book_new();
  for (const name of ["A", "B"])
    X.utils.book_append_sheet(b, X.utils.aoa_to_sheet([headers, valid]), name);
  assert.throws(
    () =>
      parseExcel(X.write(b, { type: "buffer", bookType: "xlsx" }), "t.xlsx"),
    /Mais de uma aba/,
  );
});
test("Quantidade superior à OP e potência com perda decimal rejeitadas", () => {
  const v = [...valid];
  v[5] = 49;
  assert.throws(() => parseExcel(excel([v]), "t.xlsx"), /excede/);
  v[5] = 50;
  v[2] = "37,5555kVA";
  assert.throws(() => parseExcel(excel([v]), "t.xlsx"), /numeric/);
});

test("Data com formato Excel não depende do fuso do servidor", () => {
  const b = X.utils.book_new(),
    s = X.utils.aoa_to_sheet([headers, [...valid]]);
  s.G2 = { t: "n", v: 46296, z: "dd/MM/yyyy" };
  X.utils.book_append_sheet(b, s, "Dados");
  for (const bookType of ["biff8", "xlsx"] as const) {
    const p = parseExcel(X.write(b, { type: "buffer", bookType }), "t.xlsx");
    assert.equal(p.rows[0].data_programada, "2026-10-01");
  }
});
