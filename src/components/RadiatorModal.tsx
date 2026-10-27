"use client";
import { useRef, useState, type FormEvent } from "react";
import { Save, CalendarDays, ArrowRight } from "lucide-react";
import Modal from "./Modal";
import { type Order } from "@/lib/types";
import { dateLabel } from "@/lib/domain";
import { fetchJson } from "@/lib/client";
import { newRequestId } from "@/lib/browser-id";
export default function RadiatorModal({ order, mode, schedule, onClose, onSuccess }: {
  order: Order; mode: "adicionar" | "corrigir"; schedule?: number;
  onClose: () => void; onSuccess: () => void;
}) {
  const [selected, setSelected] = useState(schedule || order.programacoes[0].id);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef<{ key: string; id: string } | null>(null);
  const prog = order.programacoes.find((p) => p.id === selected)!;
  const current = prog.radiador?.qtd_apontada || 0;
  const version = prog.radiador?.versao || 0;
  const pending = prog.qtd_programada - current;
  const amount = Number(quantity);
  const valid = quantity !== "" && Number.isSafeInteger(amount) && amount >= (mode === "adicionar" ? 1 : 0) &&
    amount <= (mode === "adicionar" ? pending : prog.qtd_programada);
  const next = mode === "adicionar" ? current + amount : amount;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError("");
    const payload = { programacao: selected, quantidade: amount, modo: mode, versao: version, observacao: note };
    const key = JSON.stringify(payload);
    if (retry.current?.key !== key) retry.current = { key, id: newRequestId() };
    try {
      await fetchJson("/api/radiador/production", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: retry.current.id }),
      });
      onSuccess();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={mode === "adicionar" ? "Apontar Radiador" : "Corrigir Radiador"}
    subtitle={`OP ${order.op_pai} · ${order.referencia_prod} · ${dateLabel(order.data_inicial)}`} onClose={onClose} busy={busy}>
    <form className="modal-body" onSubmit={save}>
      <label>Programação / faixa de séries
        <select disabled={busy} value={selected} onChange={(e) => {setSelected(Number(e.target.value)); setQuantity("");}}>
          {order.programacoes.map((p) => <option key={p.id} value={p.id}>{dateLabel(p.data_programada)} · {p.qtd_programada} un. · séries {p.serie_inicial}–{p.serie_final}</option>)}
        </select>
      </label>
      <div className="date-note"><CalendarDays size={16}/> Programação de {dateLabel(prog.data_programada)}. Cada unidade apontada representa um transformador com seu conjunto de radiadores completo.</div>
      <div className="balance">
        <div><small>Programado</small><b>{prog.qtd_programada}</b></div>
        <div><small>Produzido</small><b>{current}</b></div>
        <div><small>Pendente</small><b>{pending}</b></div>
      </div>
      <label>{mode === "adicionar" ? "Transformadores com radiadores completos" : "Novo total produzido"}
        <input autoFocus type="number" min={mode === "adicionar" ? 1 : 0} max={mode === "adicionar" ? pending : prog.qtd_programada}
          step="1" inputMode="numeric" disabled={busy} value={quantity} placeholder="Informe a quantidade" aria-invalid={quantity !== "" && !valid}
          onChange={(e) => setQuantity(e.target.value)}/>
      </label>
      {quantity !== "" && <div className={valid ? "result-preview" : "error-inline"}>
        {valid ? <><span>{current} produzidos</span><ArrowRight size={16}/><b>{next} produzidos · {prog.qtd_programada-next} pendentes</b></>
          : <span>Informe uma quantidade inteira dentro do limite disponível.</span>}
      </div>}
      <label>Observação <span className="muted">(opcional)</span><textarea disabled={busy} maxLength={500} rows={2}
        placeholder="Detalhes do apontamento..." value={note} onChange={(e) => setNote(e.target.value)}/></label>
      {error && <div className="error-inline" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={busy || !valid}><Save size={16}/>{busy ? "Salvando..." : mode === "corrigir" ? "Salvar correção" : "Confirmar apontamento"}</button>
      </div>
    </form>
  </Modal>;
}
