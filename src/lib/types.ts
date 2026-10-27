export const SECTORS = ["CORPO", "FUNDO", "TAMPA", "TAMPA BORDEADA"] as const;
export type Status = "CONCLUIDA" | "ATRASADA" | "NAO_INICIADA" | "EM_ANDAMENTO";
export const STATUS_LABEL: Record<Status, string> = {
  CONCLUIDA: "Concluída",
  ATRASADA: "Atrasada",
  NAO_INICIADA: "Não iniciada",
  EM_ANDAMENTO: "Em andamento",
};
export type ImportRow = {
  op_pai: string;
  referencia_prod: string;
  potencia_pa: number;
  linha_prod: string;
  nome_cliente: string;
  qtd_op_pai: number;
  data_programada: string;
  qtd_programada: number;
  serie_inicial: number;
  serie_final: number;
};
export type Sector = {
  subsetor_id: number;
  qtd_apontada: number;
  versao: number;
};
export type Schedule = {
  id: number;
  data_programada: string;
  qtd_programada: number;
  serie_inicial: number;
  serie_final: number;
  setores: Sector[];
  radiador?: { qtd_apontada: number; versao: number };
};
export type Order = {
  id: number;
  op_pai: string;
  referencia_prod: string;
  potencia_pa: number;
  linha_prod: string;
  nome_cliente: string;
  qtd_op_pai: number;
  qtd_programada: number;
  data_inicial: string;
  data_final: string;
  situacao: Status;
  programacoes: Schedule[];
};
export type Filters = {
  q: string;
  op: string;
  serie: string;
  cliente: string;
  potencia: string;
  linha: string;
  inicio: string;
  fim: string;
  situacao: string;
  ordem: string;
  pagina: number;
};
export const EMPTY_FILTERS: Filters = {
  q: "",
  op: "",
  serie: "",
  cliente: "",
  potencia: "",
  linha: "",
  inicio: "",
  fim: "",
  situacao: "",
  ordem: "data_asc",
  pagina: 1,
};
export type Listing = {
  items: Order[];
  total: number;
  pagina: number;
  paginas: number;
  revision: number;
  today: string;
  counts: Record<Status, number>;
  options: { clientes: string[]; potencias: number[]; linhas: string[] };
  ultima_importacao: { nome_arquivo: string; realizado_em: string } | null;
};
export type ImportPreview = {
  hash: string;
  rows: number;
  ops: number;
  units: number;
  start: string;
  end: string;
  sheet: string;
  headerRow: number;
  sample: ImportRow[];
  warnings: string[];
  database: {
    revision: number;
    removed: number;
    preserved: number;
    created: number;
    removed_records: number;
    removed_radiador_records?: number;
  } | null;
};

/** Complete daily view, sent once per refresh rather than once per UI filter. */
export type DailyDataset = {
  rows: Order[];
  revision: number;
  today: string;
  options: Listing["options"];
  ultima_importacao: Listing["ultima_importacao"];
};
