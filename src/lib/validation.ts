import { z } from "zod";
const date = z
  .string()
  .refine(
    (s) =>
      s === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
        !isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s),
    "Data inválida",
  );
export const filtersSchema = z
  .object({
    q: z.string().trim().max(300).default(""),
    op: z.string().trim().max(80).default(""),
    serie: z
      .string()
      .regex(/^\d{0,15}$/)
      .default(""),
    cliente: z.string().max(300).default(""),
    potencia: z
      .string()
      .regex(/^(?:\d{1,9}(?:\.\d{1,3})?)?$/)
      .default(""),
    linha: z.string().max(300).default(""),
    inicio: date.default(""),
    fim: date.default(""),
    situacao: z
      .enum(["", "CONCLUIDA", "ATRASADA", "NAO_INICIADA", "EM_ANDAMENTO"])
      .default(""),
    ordem: z
      .enum(["data_asc", "data_desc", "op_asc", "op_desc", "situacao"])
      .default("data_asc"),
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .refine(
    (v) => !v.inicio || !v.fim || v.inicio <= v.fim,
    "O início deve ser anterior ao fim.",
  );
export const radiatorProductionSchema = z.object({
  requestId: z.uuid(),
  programacao: z.number().int().positive().safe(),
  quantidade: z.number().int().min(0).max(2147483647),
  modo: z.enum(["adicionar", "corrigir"]),
  versao: z.number().int().nonnegative().safe(),
  observacao: z.string().trim().max(500).default(""),
}).refine((value) => value.modo !== "adicionar" || value.quantidade > 0, "Informe uma quantidade positiva.");

export const productionSchema = z.object({
  requestId: z.uuid(),
  programacao: z.number().int().positive().safe(),
  subsetor: z.number().int().min(1).max(4),
  quantidade: z.number().int().min(0).max(2147483647),
  modo: z.enum(["adicionar", "corrigir"]),
  versao: z.number().int().nonnegative().safe(),
  observacao: z.string().trim().max(500).default(""),
});

/** Multi-sector addition only; correction keeps the original one-sector endpoint. */
export const productionBatchSchema = z.object({
  requestId: z.uuid(),
  programacao: z.number().int().positive().safe(),
  modo: z.literal("adicionar"),
  observacao: z.string().trim().max(500).default(""),
  apontamentos: z.array(z.object({
    subsetor: z.number().int().min(1).max(4),
    quantidade: z.number().int().positive().max(2147483647),
    versao: z.number().int().nonnegative().safe(),
  })).min(1).max(4),
}).superRefine((value, context) => {
  const seen = new Set<number>();
  for (const [index, entry] of value.apontamentos.entries()) {
    if (seen.has(entry.subsetor)) {
      context.addIssue({
        code: "custom",
        path: ["apontamentos", index, "subsetor"],
        message: "O mesmo subsetor não pode ser informado duas vezes.",
      });
    }
    seen.add(entry.subsetor);
  }
});
