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
    [amounts, setAmounts] = useState<string[]>(["", "", "", ""]),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const retry = useRef<{ key: string; id: string } | null>(null);
  const prog = order.programacoes.find((p) => p.id === selected)!;
  const current = prog.setores.find((s) => s.subsetor_id === sector)!;
  const value = Number(quantity),
    next = value;
  const validCorrection =
    quantity !== "" &&
    Number.isInteger(value) &&
    value >= 0 &&
    next <= prog.qtd_programada;
  const batch = prog.setores.filter((s) => {
    const amount = amounts[s.subsetor_id - 1];
    return amount !== "" && Number(amount) > 0;
  }).map((s) => ({
    subsetor: s.subsetor_id,
    quantidade: Number(amounts[s.subsetor_id - 1]),
    versao: s.versao,
  }));
  const invalidAmounts = prog.setores.some((s) => {
    const raw = amounts[s.subsetor_id - 1];
    if (raw === "") return false;
    const amount = Number(raw);
    return !Number.isSafeInteger(amount) || amount < 0 ||
      amount > prog.qtd_programada - s.qtd_apontada;
  });
  const valid = mode === "adicionar"
    ? batch.length > 0 && !invalidAmounts
    : validCorrection;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    const payload = mode === "adicionar"
      ? {
          programacao: selected,
          apontamentos: batch,
          modo: "adicionar" as const,
          observacao: note,
        }
      : {
          programacao: selected,
          subsetor: sector,
          quantidade: value,
          modo: "corrigir" as const,
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
              setAmounts(["", "", "", ""]);
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
        {mode === "adicionar" && (
          <fieldset className="multi-sector" disabled={busy}>
            <legend>Quantidade a apontar por subsetor</legend>
            <p className="multi-sector-help">
              Preencha apenas os subsetores produzidos. Cada quantidade tem seu próprio saldo;
              campos vazios ou com zero não serão registrados.
            </p>
            <div className="multi-sector-list">
              {SECTORS.map((name, i) => {
                const entry = prog.setores.find((s) => s.subsetor_id === i + 1)!;
                const pending = prog.qtd_programada - entry.qtd_apontada;
                const raw = amounts[i];
                const qty = Number(raw);
                const invalid = raw !== "" && (
                  !Number.isSafeInteger(qty) || qty < 0 || qty > pending
                );
                return (
                  <div key={name} className={`multi-sector-row ${invalid ? "invalid" : ""}`}>
                    <div className="multi-sector-meta">
                      <strong>{name}</strong>
                      <span>{entry.qtd_apontada} produzido(s) · {pending} pendente(s)</span>
                    </div>
                    <label className="multi-sector-quantity">
                      <span className="sr-only">Quantidade de {name}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min="0"
                        max={pending}
                        placeholder="0"
                        value={raw}
                        aria-invalid={invalid}
                        onChange={(e) => setAmounts((previous) =>
                          previous.map((amount, index) => index === i ? e.target.value : amount))}
                      />
                    </label>
                    {invalid && <span className="multi-sector-error">Saldo disponível: {pending}.</span>}
                  </div>
                );
              })}
            </div>
            <div className="multi-sector-summary" aria-live="polite">
              <span>{batch.length} subsetor(es) selecionado(s)</span>
              <strong>{batch.reduce((total, item) => total + item.quantidade, 0)} apontamento(s) de peças</strong>
            </div>
            <p className="multi-sector-help">
              A confirmação é conjunta: se algum subsetor falhar na validação,
              nenhum apontamento deste envio será salvo.
            </p>
            {invalidAmounts && (
              <div className="error-inline" role="alert">
                Corrija as quantidades destacadas antes de confirmar.
              </div>
            )}
          </fieldset>
        )}
        {mode === "corrigir" && <>
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
          Novo total produzido
          <input
            autoFocus
            disabled={busy}
            inputMode="numeric"
            type="number"
            min={0}
            max={prog.qtd_programada}
            step="1"
            placeholder={String(current.qtd_apontada)}
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
        </>}
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
