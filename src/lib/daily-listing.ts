import { statusOf } from "./domain";
import { type DailyDataset, type Filters, type Listing, type Order, type Schedule, type Sector, type Status } from "./types";

// Pure projection; never changes allocations, scheduling, or FIFO rules.
export type StoredOrder = Pick<Order,
  "id" | "op_pai" | "referencia_prod" | "potencia_pa" | "linha_prod" |
  "nome_cliente" | "qtd_op_pai">;
export type StoredSchedule = Omit<Schedule, "setores" | "radiador"> & { op_id: number };
export type StoredRadiatorAllocation = { programacao_id: number; quantidade: number; versao: number };
export type StoredAllocation = { programacao_id: number; subsetor_id: number; quantidade: number; versao: number };
type ImportInfo = Listing["ultima_importacao"];
const PAGE_SIZE = 12;

/** Once per refresh, project OPs into their daily rows, preserving schedule IDs. */
export function dailyDataset(
  orders: StoredOrder[],
  schedules: StoredSchedule[],
  allocations: StoredAllocation[],
  today: string,
  revision: number,
  lastImport: ImportInfo,
  radiatorAllocations: StoredRadiatorAllocation[] = [],
): DailyDataset {
  const orderById = new Map(orders.map((o) => [Number(o.id), o]));
  const radiatorBySchedule = new Map(radiatorAllocations.map((a) => [Number(a.programacao_id), {
    qtd_apontada: Number(a.quantidade), versao: Number(a.versao),
  }]));
  const allocationBySchedule = new Map<number, Sector[]>();
  for (const a of allocations) {
    const id = Number(a.programacao_id);
    const group = allocationBySchedule.get(id) || [];
    group.push({
      subsetor_id: Number(a.subsetor_id),
      qtd_apontada: Number(a.quantidade),
      versao: Number(a.versao),
    });
    allocationBySchedule.set(id, group);
  }

  // Uma linha/card por OP + data; múltiplas faixas da MESMA data continuam
  // separadas em programacoes para que o formulário use os IDs reais do banco.
  const groups = new Map<string, Order>();
  for (const raw of schedules) {
    const source = orderById.get(Number(raw.op_id));
    if (!source) continue;
    const date = raw.data_programada;
    const key = `${source.id}:${date}`;
    let row = groups.get(key);
    if (!row) {
      row = {
        ...source,
        qtd_programada: 0,
        data_inicial: date,
        data_final: date,
        situacao: "NAO_INICIADA",
        programacoes: [],
      };
      groups.set(key, row);
    }
    const schedule: Schedule = {
      id: Number(raw.id),
      data_programada: date,
      qtd_programada: Number(raw.qtd_programada),
      serie_inicial: Number(raw.serie_inicial),
      serie_final: Number(raw.serie_final),
      setores: allocationBySchedule.get(Number(raw.id)) || [],
      radiador: radiatorBySchedule.get(Number(raw.id)) || { qtd_apontada: 0, versao: 0 },
    };
    row.programacoes.push(schedule);
    row.qtd_programada += schedule.qtd_programada;
  }

  const allRows = Array.from(groups.values()).map((row) => {
    row.programacoes.sort((a, b) =>
      a.serie_inicial - b.serie_inicial || a.id - b.id,
    );
    row.situacao = statusOf(row.programacoes, today);
    return row;
  });
  return {
    rows: allRows,
    revision,
    today,
    options: {
      clientes: Array.from(new Set(orders.map((o) => o.nome_cliente))).sort((a,b) => a.localeCompare(b, "pt-BR")),
      linhas: Array.from(new Set(orders.map((o) => o.linha_prod))).sort((a,b) => a.localeCompare(b, "pt-BR")),
      potencias: Array.from(new Set(orders.map((o) => Number(o.potencia_pa)))).sort((a,b) => a - b),
    },
    ultima_importacao: lastImport,
  };
}

/** Radiador is independent: its status never participates in Estamparia completion. */
export function radiatorStatus(schedules: Schedule[], today: string): Status {
  if (!schedules.length) return "NAO_INICIADA";
  if (schedules.every((p) => (p.radiador?.qtd_apontada || 0) === p.qtd_programada)) return "CONCLUIDA";
  if (schedules.some((p) => p.data_programada < today && (p.radiador?.qtd_apontada || 0) < p.qtd_programada)) return "ATRASADA";
  if (schedules.every((p) => (p.radiador?.qtd_apontada || 0) === 0)) return "NAO_INICIADA";
  return "EM_ANDAMENTO";
}

/** Filters and paginates the same projected rows locally, without a read request. */
export function filterDailyDataset(dataset: DailyDataset, filters: Filters, sector: "estamparia" | "radiador" = "estamparia"): Listing {
  const { rows: allRows, revision, today, options, ultima_importacao: lastImport } = dataset;
  const rawText = filters.q.toLocaleLowerCase("pt-BR");
  const freeSeries = /^\d{1,15}$/.test(filters.q) ? Number(filters.q) : null;
  const series = filters.serie ? Number(filters.serie) : null;
  const filtered = allRows.filter((row) => {
    if (rawText && ![
      row.op_pai,
      row.nome_cliente,
      row.referencia_prod,
    ].some((s) => s.toLocaleLowerCase("pt-BR").includes(rawText)) &&
      !(freeSeries !== null && row.programacoes.some((p) =>
        freeSeries >= p.serie_inicial && freeSeries <= p.serie_final))) return false;
    if (filters.op && !row.op_pai.toLocaleLowerCase("pt-BR").includes(filters.op.toLocaleLowerCase("pt-BR"))) return false;
    if (filters.cliente && row.nome_cliente !== filters.cliente) return false;
    if (filters.linha && row.linha_prod !== filters.linha) return false;
    if (filters.potencia && Number(row.potencia_pa) !== Number(filters.potencia)) return false;
    if (series !== null && !row.programacoes.some((p) => series >= p.serie_inicial && series <= p.serie_final)) return false;
    if (filters.inicio && row.data_inicial < filters.inicio) return false;
    if (filters.fim && row.data_inicial > filters.fim) return false;
    return true;
  });

  const counts: Record<Status, number> = {
    ATRASADA: 0,
    CONCLUIDA: 0,
    EM_ANDAMENTO: 0,
    NAO_INICIADA: 0,
  };
  // Os indicadores representam programações diárias (não OPs inteiras).
  const forSector = sector === "radiador"
    ? filtered.map((row) => ({ ...row, situacao: radiatorStatus(row.programacoes, today) }))
    : filtered;
  for (const row of forSector) counts[row.situacao]++;
  const visible = filters.situacao
    ? forSector.filter((r) => r.situacao === filters.situacao)
    : forSector;
  const opCompare = (a: Order, b: Order) => {
    const aNum = /^\d+$/.test(a.op_pai);
    const bNum = /^\d+$/.test(b.op_pai);
    return aNum && bNum
      ? Number(a.op_pai) - Number(b.op_pai)
      : a.op_pai.localeCompare(b.op_pai, "pt-BR", { numeric: true });
  };
  const sorted = [...visible].sort((a, b) => {
    let result = 0;
    if (filters.ordem === "data_desc") result = b.data_inicial.localeCompare(a.data_inicial);
    else if (filters.ordem === "op_asc") result = opCompare(a, b);
    else if (filters.ordem === "op_desc") result = opCompare(b, a);
    else if (filters.ordem === "situacao") result = a.situacao.localeCompare(b.situacao);
    if (!result) result = a.data_inicial.localeCompare(b.data_inicial);
    return result || opCompare(a, b) || a.programacoes[0].id - b.programacoes[0].id;
  });
  const total = sorted.length;
  return {
    items: sorted.slice((filters.pagina - 1) * PAGE_SIZE, filters.pagina * PAGE_SIZE),
    total,
    pagina: filters.pagina,
    paginas: Math.ceil(total / PAGE_SIZE),
    revision,
    today,
    counts,
    options,
    ultima_importacao: lastImport,
  };
}

/** Original server API remains supported and uses the identical business rules. */
export function dailyListing(
  orders: StoredOrder[],
  schedules: StoredSchedule[],
  allocations: StoredAllocation[],
  filters: Filters,
  today: string,
  revision: number,
  lastImport: ImportInfo,
  radiatorAllocations: StoredRadiatorAllocation[] = [],
): Listing {
  return filterDailyDataset(
    dailyDataset(orders, schedules, allocations, today, revision, lastImport, radiatorAllocations),
    filters,
  );
}
