"use client";
import { CheckCircle2, Pencil, Plus } from "lucide-react";
import { type Order, SECTORS } from "@/lib/types";
import { dateLabel, numberLabel } from "@/lib/domain";
import { Badge } from "./OrderCard";

type Action = (order: Order, mode: "adicionar" | "corrigir", schedule?: number) => void;

export default function OrderTable({ items, onAction, onNoNeed, mode = "estamparia" }: { items: Order[]; onAction: Action; onNoNeed?: (order: Order) => void; mode?: "estamparia" | "radiador" }) {
  return (
    <div className="program-table-wrap" role="region" aria-label="Programações diárias de produção" tabIndex={0}>
      <table className="program-table">
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">OP</th>
            <th scope="col">Cliente / referência</th>
            <th scope="col">Linha / potência</th>
            <th scope="col" className="num-col">Qtd. OP</th>
            <th scope="col" className="num-col">Prog. dia</th>
            {mode === "estamparia" && SECTORS.map((s) => <th scope="col" key={s} className="sector-col">{s}</th>)}
            {mode === "radiador" && <th scope="col" className="sector-col">RADIADOR</th>}
            <th scope="col">Situação {mode === "radiador" ? "Radiador" : "Estamparia"}</th>
            <th scope="col" className="actions-col">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((order) => {
            const series = order.programacoes.map((p) => `${p.serie_inicial}–${p.serie_final}`).join(", ");
            const first = order.programacoes[0].id;
            return (
              <tr key={`${order.id}:${order.data_inicial}`}>
                <td><span className="table-date">{dateLabel(order.data_inicial)}</span></td>
                <td>
                  <strong className="table-op">{order.op_pai}</strong>
                  <span className="table-sub" title={series}>Séries: {series}</span>
                </td>
                <td>
                  <strong className="table-primary" title={order.nome_cliente}>{order.nome_cliente}</strong>
                  <span className="table-sub">{order.referencia_prod}</span>
                </td>
                <td>
                  <span className="table-primary">{order.linha_prod}</span>
                  <span className="table-sub">{numberLabel(order.potencia_pa)} kVA</span>
                </td>
                <td className="num-col muted">{numberLabel(order.qtd_op_pai)}</td>
                <td className="num-col"><strong className="table-scheduled">{numberLabel(order.qtd_programada)}</strong></td>
                {mode === "estamparia" && SECTORS.map((sector, i) => {
                  const produced = order.programacoes.reduce((total, p) =>
                    total + (p.setores.find((s) => s.subsetor_id === i + 1)?.qtd_apontada || 0), 0);
                  const percentage = order.qtd_programada ? produced / order.qtd_programada * 100 : 0;
                  return (
                    <td key={sector} className="sector-col">
                      <span className="table-progress-label"><strong>{numberLabel(produced)}</strong> / {numberLabel(order.qtd_programada)}</span>
                      <span className="table-progress-track" aria-label={`${sector}: ${produced} de ${order.qtd_programada}`}>
                        <span style={{ width: `${Math.min(100, percentage)}%` }} />
                      </span>
                    </td>
                  );
                })}
                {mode === "radiador" && <td className="sector-col">
                  {(() => {
                    if (mode === "radiador" && order.programacoes.every((p) => p.radiador_nao_necessario)) return <strong>Não necessita de radiador</strong>;
                    const produced = order.programacoes.reduce((sum,p) => sum + (p.radiador?.qtd_apontada || 0),0);
                    return <><span className="table-progress-label"><strong>{numberLabel(produced)}</strong> / {numberLabel(order.qtd_programada)}</span>
                      <span className="table-progress-track radiator-track" aria-label={`Radiador: ${produced} de ${order.qtd_programada}`}><span style={{ width: `${order.qtd_programada ? Math.min(100, produced / order.qtd_programada * 100) : 0}%` }} /></span></>;
                  })()}
                </td>}
                <td><Badge status={order.situacao} /></td>
                <td>
                  <div className="table-actions">
                    <button className="primary" onClick={() => onAction(order, "adicionar", first)} aria-label={`Apontar OP ${order.op_pai} em ${dateLabel(order.data_inicial)}`} title="Apontar nesta data"><Plus size={15} /> Apontar</button>
                    <button className="secondary" onClick={() => onAction(order, "corrigir", first)} aria-label={`Editar OP ${order.op_pai} em ${dateLabel(order.data_inicial)}`} title="Editar nesta data"><Pencil size={15} /></button>
                    {mode === "radiador" && !order.programacoes.every((p) => p.radiador_nao_necessario) && <button className="secondary" onClick={() => onNoNeed?.(order)} title="Finalizar sem necessidade de radiador"><CheckCircle2 size={15}/> Não necessita</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
