import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import type { ImportRow, ImportPreview } from "./types";
export const MAX_FILE_SIZE = 4_000_000;
export const MAX_ROWS = 10_000;
const columns = [
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
const normalize = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const text = (v: unknown) => String(v ?? "").trim();
function numeric(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let s = text(value).replace(/\s/g, "");
  if (!s || !/^\d+(?:[.,]\d+)*$/.test(s))
    throw Error(`${label}: número inválido (${text(value)}).`);
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) throw Error(`${label}: número inválido.`);
  return n;
}
function integerValue(v: unknown) {
  return typeof v === "string" && /^\d{1,3}(?:\.\d{3})+(?:,0+)?$/.test(v.trim())
    ? v.replace(/\./g, "")
    : v;
}
function integer(v: unknown, label: string, min = 0) {
  const n = numeric(integerValue(v), label);
  if (!Number.isSafeInteger(n) || n < min || n > 2147483647)
    throw Error(`${label}: informe um inteiro entre ${min} e 2.147.483.647.`);
  return n;
}
function series(v: unknown, label: string) {
  const n = numeric(integerValue(v), label);
  if (!Number.isSafeInteger(n) || n < 0)
    throw Error(
      `${label}: série numérica inválida ou maior que o limite seguro.`,
    );
  return n;
}
export function power(v: unknown) {
  if (typeof v === "number") return numeric(v, "Potência PA");
  const m = text(v).match(/^(\d+(?:[.,]\d+)*)\s*(?:kva\b(?:\s*\([^)]*\))?)?$/i);
  if (!m) throw Error(`Potência PA inválida: ${text(v)}.`);
  return numeric(m[1], "Potência PA");
}
export function excelDate(v: unknown, date1904 = false): string {
  let y: number, m: number, d: number;
  if (typeof v === "number") {
    const p = XLSX.SSF.parse_date_code(v, { date1904 });
    if (!p) throw Error("Data programada inválida.");
    ({ y, m, d } = p);
  } else {
    const s = text(v);
    let a = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: 00:00:00)?$/);
    if (a) {
      d = +a[1];
      m = +a[2];
      y = +a[3];
    } else {
      a = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z?)?$/);
      if (!a) throw Error(`Data inválida: ${s}. Use dia/mês/ano.`);
      y = +a[1];
      m = +a[2];
      d = +a[3];
    }
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    y < 1900 ||
    y > 2200 ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    throw Error("Data programada inválida.");
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
// Inspect ZIP central-directory sizes before SheetJS allocates decompressed XML.
function checkZip(buf: Buffer) {
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return;
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("Arquivo XLSX corrompido.");
  const entries = buf.readUInt16LE(end + 10);
  let pos = buf.readUInt32LE(end + 16),
    total = 0;
  if (entries > 2000) throw Error("Arquivo contém entradas demais.");
  for (let i = 0; i < entries; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50)
      throw Error("Estrutura XLSX inválida.");
    total += buf.readUInt32LE(pos + 24);
    if (total > 40_000_000) throw Error("Planilha descompactada excede 40 MB.");
    pos +=
      46 +
      buf.readUInt16LE(pos + 28) +
      buf.readUInt16LE(pos + 30) +
      buf.readUInt16LE(pos + 32);
  }
}
export function parseExcel(
  buf: Buffer,
  filename: string,
): { rows: ImportRow[]; preview: Omit<ImportPreview, "database"> } {
  if (!/\.xlsx?$/i.test(filename))
    throw Error("Selecione um arquivo .xls ou .xlsx.");
  if (!buf.length || buf.length > MAX_FILE_SIZE)
    throw Error("O arquivo deve ter até 4 MB.");
  const ole = buf
    .subarray(0, 8)
    .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!ole && !(buf[0] === 0x50 && buf[1] === 0x4b))
    throw Error("O conteúdo não é um arquivo Excel XLS/XLSX válido.");
  checkZip(buf);
  const wb = XLSX.read(buf, {
    type: "buffer",
    cellDates: false,
    cellFormula: true,
    cellNF: true,
    sheetRows: MAX_ROWS + 102,
  });
  const matches: {
    name: string;
    header: number;
    data: unknown[][];
    indices: number[];
  }[] = [];
  for (const name of wb.SheetNames) {
    const sh = wb.Sheets[name];
    const ref = sh["!fullref"] || sh["!ref"];
    if (ref && XLSX.utils.decode_range(ref).e.r > MAX_ROWS + 100)
      throw Error("Planilha excede o limite de 10.000 linhas.");
    const data = XLSX.utils.sheet_to_json<unknown[]>(sh, {
      header: 1,
      defval: null,
      raw: true,
    });
    for (let h = 0; h < Math.min(data.length, 100); h++) {
      const names = data[h].map(normalize);
      const indices = columns.map((c) => names.indexOf(normalize(c)));
      if (indices.every((i) => i >= 0)) {
        if (
          columns.some(
            (c) => names.filter((n) => n === normalize(c)).length > 1,
          )
        )
          throw Error("Cabeçalho com colunas obrigatórias repetidas.");
        matches.push({ name, header: h, data, indices });
        break;
      }
    }
  }
  if (matches.length !== 1)
    throw Error(
      matches.length
        ? "Mais de uma aba contém a programação. Mantenha apenas uma aba de dados."
        : `Cabeçalho não encontrado. Colunas obrigatórias: ${columns.join(", ")}.`,
    );
  const { name, header, data, indices } = matches[0];
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  for (let i = header + 1; i < data.length; i++) {
    if (data[i].every((v) => v === null || text(v) === "")) continue;
    try {
      const c = indices.map((j, k) => {
        const cell = wb.Sheets[name][XLSX.utils.encode_cell({ r: i, c: j })];
        return [0, 1, 3, 4].includes(k) &&
          typeof cell?.v === "number" &&
          /^0+$/.test(cell.z || "")
          ? XLSX.utils.format_cell(cell)
          : (cell?.v ?? data[i][j]);
      });
      for (const j of indices) {
        const cell = wb.Sheets[name][XLSX.utils.encode_cell({ r: i, c: j })];
        if (cell?.f)
          throw Error(
            "Fórmulas nas colunas obrigatórias não são aceitas; exporte os valores.",
          );
      }
      const op = text(c[0]);
      if (!op || op.length > 80)
        throw Error("OP-Pai obrigatória, com até 80 caracteres.");
      const row: ImportRow = {
        op_pai: op,
        referencia_prod: text(c[1]),
        potencia_pa: power(c[2]),
        linha_prod: text(c[3]),
        nome_cliente: text(c[4]),
        qtd_op_pai: integer(c[5], "Qtd.OP-Pai", 1),
        data_programada: excelDate(c[6], !!wb.Workbook?.WBProps?.date1904),
        qtd_programada: integer(c[7], "Qtd.Programada", 1),
        serie_inicial: series(c[8], "Série Inicial"),
        serie_final: series(c[9], "Série Final"),
      };
      if (
        row.potencia_pa <= 0 ||
        row.potencia_pa >= 1e9 ||
        Math.abs(row.potencia_pa * 1000 - Math.round(row.potencia_pa * 1000)) >
          1e-6
      )
        throw Error("Potência fora do limite numeric(12,3).");
      if (row.serie_final - row.serie_inicial + 1 !== row.qtd_programada)
        throw Error(
          "Intervalo de séries incompatível com a quantidade programada.",
        );
      if (
        [row.referencia_prod, row.linha_prod, row.nome_cliente].some(
          (s) => !s || s.length > 300,
        )
      )
        throw Error(
          "Referência, linha e cliente são obrigatórios (até 300 caracteres).",
        );
      rows.push(row);
    } catch (e) {
      errors.push(`Linha ${i + 1}: ${(e as Error).message}`);
      if (errors.length === 30) break;
    }
  }
  if (errors.length) throw Error(errors.join("\n"));
  if (!rows.length) throw Error("Nenhuma programação encontrada.");
  if (rows.length > MAX_ROWS) throw Error("Limite de 10.000 linhas excedido.");
  const groups = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const g = groups.get(r.op_pai) || [];
    g.push(r);
    groups.set(r.op_pai, g);
  }
  const warnings: string[] = [];
  for (const [op, group] of groups) {
    const first = group[0];
    const fields = [
      "referencia_prod",
      "potencia_pa",
      "linha_prod",
      "nome_cliente",
      "qtd_op_pai",
    ] as const;
    if (group.some((r) => fields.some((k) => r[k] !== first[k])))
      throw Error(`OP ${op}: dados da OP inconsistentes entre linhas.`);
    const sorted = [...group].sort((a, b) => a.serie_inicial - b.serie_inicial);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].serie_inicial <= sorted[i - 1].serie_final)
        throw Error(`OP ${op}: séries sobrepostas ou linhas duplicadas.`);
    const sum = group.reduce((t, r) => t + r.qtd_programada, 0);
    if (sum > first.qtd_op_pai)
      throw Error(
        `OP ${op}: programação (${sum}) excede a quantidade da OP (${first.qtd_op_pai}).`,
      );
    if (sum < first.qtd_op_pai)
      warnings.push(
        `OP ${op}: ${sum} de ${first.qtd_op_pai} unidades no arquivo (programação parcial aceita).`,
      );
  }
  const dates = rows.map((r) => r.data_programada).sort();
  return {
    rows,
    preview: {
      hash: createHash("sha256").update(buf).digest("hex"),
      rows: rows.length,
      ops: groups.size,
      units: rows.reduce((s, r) => s + r.qtd_programada, 0),
      start: dates[0],
      end: dates.at(-1)!,
      sheet: name,
      headerRow: header + 1,
      sample: rows.slice(0, 5),
      warnings,
    },
  };
}
