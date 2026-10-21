"use client";
import { useRef, useState } from "react";
import { ArrowRight, Save, CalendarDays } from "lucide-react";
import { type Order, SECTORS } from "@/lib/types";
import { dateLabel } from "@/lib/domain";
import Modal from "./Modal";
import { fetchJson } from "@/lib/client";
import { newRequestId } from "@/lib/browser-id";
export default function ProductionModal({
  order,
  mode,
  schedule,
  onClose,
  onSuccess,
}: {
  order: Order;
  mode: "adicionar" | "corrigir";
  schedule?: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selected, setSelected] = useState(
      schedule || order.programacoes[0].id,
    ),
    [sector, setSector] = useState(1),
    [quantity, setQuantity] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const retry = useRef<{ key: string; id: string } | null>(null);
  const prog = order.programacoes.find((p) => p.id === selected)!;
  const current = prog.setores.find((s) => s.subsetor_id === sector)!;
  const value = Number(quantity),
    next = mode === "adicionar" ? current.qtd_apontada + value : value;
  const valid =
    quantity !== "" &&
    Number.isInteger(value) &&
    value >= 0 &&
    (mode === "corrigir" || value > 0) &&
    next <= prog.qtd_programada;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    const payload = {
      programacao: selected,
      subsetor: sector,
      quantidade: value,
      modo: mode,
      versao: current.versao,
      observacao: note,
    };
    const key = JSON.stringify(payload);
    if (retry.current?.key !== key)
      retry.current = { key, id: newRequestId() };
    try {
      await fetchJson("/api/production", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: retry.current.id }),
      });
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={mode === "adicionar" ? "Apontar produção" : "Corrigir produção"}
      subtitle={`OP ${order.op_pai} · ${order.referencia_prod} · ${dateLabel(order.data_inicial)}`}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={save} className="modal-body">
        <label>
          {order.programacoes.length > 1 ? "Faixa de séries nesta data" : "Programação do dia"}
          <select
            disabled={busy}
            value={selected}
            onChange={(e) => {
              setSelected(+e.target.value);
              setQuantity("");
            }}
          >
            {order.programacoes.map((p) => (
              <option key={p.id} value={p.id}>
                {dateLabel(p.data_programada)} · {p.qtd_programada} un. · séries{" "}
                {p.serie_inicial}–{p.serie_final}
              </option>
            ))}
          </select>
        </label>
        <div className="date-note">
          <CalendarDays size={16} />
          Produção programada para {dateLabel(prog.data_programada)}.
          {order.programacoes.length > 1
            ? ` Total do dia: ${order.qtd_programada} unidades em ${order.programacoes.length} faixas. Selecione a faixa correta acima.`
            : ""}
          O horário do registro será o de agora.
        </div>
        <fieldset disabled={busy} className="sector-picker">
          <legend>Subsetor</legend>
          {SECTORS.map((s, i) => (
            <button
              type="button"
              key={s}
              aria-pressed={sector === i + 1}
              onClick={() => {
                setSector(i + 1);
                setQuantity("");
              }}
            >
              {s}
            </button>
          ))}
        </fieldset>
        <div className="balance">
          <div>
            <small>Programado</small>
            <b>{prog.qtd_programada}</b>
          </div>
          <div>
            <small>Produzido</small>
            <b>{current.qtd_apontada}</b>
          </div>
          <div>
            <small>Pendente</small>
            <b>{prog.qtd_programada - current.qtd_apontada}</b>
          </div>
        </div>
        <label>
          {mode === "adicionar"
            ? "Quantidade produzida neste lançamento"
            : "Novo total produzido"}
          <input
            autoFocus
            disabled={busy}
            inputMode="numeric"
            type="number"
            min={mode === "adicionar" ? 1 : 0}
            max={
              mode === "adicionar"
                ? prog.qtd_programada - current.qtd_apontada
                : prog.qtd_programada
            }
            step="1"
            placeholder={
              mode === "corrigir" ? String(current.qtd_apontada) : "0"
            }
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        {quantity !== "" && (
          <div className={valid ? "result-preview" : "error-inline"}>
            {valid ? (
              <>
                <span>{current.qtd_apontada} produzidos</span>
                <ArrowRight size={16} />
                <b>
                  {next} produzidos · {prog.qtd_programada - next} pendentes
                </b>
              </>
            ) : (
              <span>
                Informe uma quantidade inteira dentro do saldo disponível.
              </span>
            )}
          </div>
        )}
        <label>
          Observação <span className="muted">(opcional)</span>
          <textarea
            disabled={busy}
            maxLength={500}
            rows={2}
            placeholder="Acrescente um detalhe sobre este registro..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {error && (
          <div className="error-inline" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="primary" disabled={busy || !valid}>
            <Save size={16} />
            {busy
              ? "Salvando..."
              : mode === "adicionar"
                ? "Confirmar apontamento"
                : "Salvar correção"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
