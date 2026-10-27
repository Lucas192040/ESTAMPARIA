"use client";
import {
  CalendarDays,
  Pencil,
  Plus,
  Cylinder,
  Box,
  Layers,
  SquareStack,
  Clock3,
  Check,
  Play,
  AlertCircle,
} from "lucide-react";
import {
  type Order,
  SECTORS,
  STATUS_LABEL,
  type Status,
} from "@/lib/types";
import { dateLabel, numberLabel } from "@/lib/domain";
const icons = [Cylinder, Box, Layers, SquareStack];
export function Badge({ status }: { status: Status }) {
  const Icon = {
    CONCLUIDA: Check,
    ATRASADA: AlertCircle,
    NAO_INICIADA: Clock3,
    EM_ANDAMENTO: Play,
  }[status];
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <Icon size={12} />
      {STATUS_LABEL[status]}
    </span>
  );
}
export function Progress({
  produced,
  total,
  index,
}: {
  produced: number;
  total: number;
  index: number;
}) {
  const percent = total ? Math.round((produced / total) * 100) : 0;
  const Icon = icons[index];
  const color =
    percent === 100
      ? "green"
      : percent >= 60
        ? "blue"
        : percent >= 30
          ? "amber"
          : percent > 0
            ? "red"
            : "gray";
  return (
    <div className="progress-row">
      <span className="sector-name">
        <Icon size={17} />
        {SECTORS[index]}
      </span>
      <span className="progress-count">
        <b className={color}>{numberLabel(produced)}</b>
        <span> / {numberLabel(total)}</span>
      </span>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={SECTORS[index]}
        aria-valuenow={produced}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div className={color} style={{ width: `${percent}%` }} />
      </div>
      <strong className="percentage">{percent}%</strong>
      <small className="pending">
        {numberLabel(total - produced)} pendentes
      </small>
    </div>
  );
}
export default function OrderCard({
  order,
  onAction,
  mode = "estamparia",
}: {
  order: Order;
  mode?: "estamparia" | "radiador";
  onAction: (
    o: Order,
    mode: "adicionar" | "corrigir",
    schedule?: number,
  ) => void;
}) {
  const series = order.programacoes.map((p) =>
    `${p.serie_inicial}–${p.serie_final}`,
  );
  const firstSchedule = order.programacoes[0].id;
  return (
    <article className="order-card">
      <header className="card-head">
        <h2>OP <span>{order.op_pai}</span></h2>
        <Badge status={order.situacao} />
        <span className="card-date">
          <CalendarDays size={14} />
          {dateLabel(order.data_inicial)}
        </span>
      </header>
      <div className="card-details">
        <div className="client">
          <small>Cliente</small>
          <strong title={order.nome_cliente}>{order.nome_cliente}</strong>
        </div>
        <div>
          <small>Referência</small>
          <strong>{order.referencia_prod}</strong>
        </div>
        <div>
          <small>Potência</small>
          <strong>{numberLabel(order.potencia_pa)} <span>kVA</span></strong>
        </div>
      </div>
      <div className="card-meta daily-card-meta">
        <div><small>Linha</small><strong>{order.linha_prod}</strong></div>
        <div><small>Qtd. total da OP</small><strong>{numberLabel(order.qtd_op_pai)}</strong></div>
        <div className="daily-emphasis"><small>Programado no dia</small><strong>{numberLabel(order.qtd_programada)}</strong></div>
        <div><small>Séries nesta data</small><strong className="card-series" title={series.join(", ")}>{series.join(", ")}</strong></div>
      </div>
      <div className="progress-section">
        <div className="section-eyebrow">
          PROGRESSO DE {dateLabel(order.data_inicial)}
          <span>Produzido / programado no dia</span>
        </div>
        {SECTORS.map((_, i) => (
          <Progress
            key={i}
            index={i}
            total={order.qtd_programada}
            produced={order.programacoes.reduce(
              (sum, p) => sum + (p.setores.find((s) => s.subsetor_id === i + 1)?.qtd_apontada || 0),
              0,
            )}
          />
        ))}
        <div className="radiator-progress">
          <div className="radiator-heading">RADIADOR <small>(controle independente)</small></div>
          {(() => { const produced = order.programacoes.reduce((total,p) => total + (p.radiador?.qtd_apontada || 0), 0);
            const percent = order.qtd_programada ? produced / order.qtd_programada * 100 : 0;
            return <><div className="radiator-progress-numbers"><strong>{numberLabel(produced)} / {numberLabel(order.qtd_programada)}</strong><span>{Math.round(percent)}% · {numberLabel(order.qtd_programada - produced)} pendentes</span></div>
              <div className="table-progress-track radiator-track"><span style={{width: `${Math.min(100,percent)}%`}}/></div></>;
          })()}
        </div>
      </div>
      <div className="card-actions">
        <button className="primary" onClick={() => onAction(order, "adicionar", firstSchedule)}>
          <Plus size={17} /> Apontar
        </button>
        <button className="secondary" onClick={() => onAction(order, "corrigir", firstSchedule)}>
          <Pencil size={15} /> Editar
        </button>
      </div>
    </article>
  );
}
