import { type Schedule, type Status } from "./types";
export function manausDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function statusOf(schedules: Schedule[], today = manausDate()): Status {
  if (!schedules.length) return "NAO_INICIADA";
  if (
    schedules.every(
      (p) =>
        p.setores.length === 4 &&
        p.setores.every((s) => s.qtd_apontada === p.qtd_programada),
    )
  )
    return "CONCLUIDA";
  if (
    schedules.some(
      (p) =>
        p.data_programada < today &&
        (p.setores.length < 4 ||
          p.setores.some((s) => s.qtd_apontada < p.qtd_programada)),
    )
  )
    return "ATRASADA";
  return schedules.every((p) => p.setores.every((s) => s.qtd_apontada === 0))
    ? "NAO_INICIADA"
    : "EM_ANDAMENTO";
}
export function dateLabel(date: string) {
  return date.split("-").reverse().join("/");
}
export function numberLabel(value: number) {
  return value.toLocaleString("pt-BR");
}
