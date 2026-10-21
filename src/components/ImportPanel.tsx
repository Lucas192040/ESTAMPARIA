"use client";
import { useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import type { ImportPreview } from "@/lib/types";
import { dateLabel, numberLabel } from "@/lib/domain";
import Modal from "./Modal";
import { fetchJson } from "@/lib/client";
import { newRequestId } from "@/lib/browser-id";
export default function ImportPanel({
  connected,
  onClose,
  onSuccess,
}: {
  connected: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [agree, setAgree] = useState(false);
  const requestId = useRef("");
  async function send(action: "preview" | "confirm") {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("action", action);
    if (action === "confirm" && preview?.database) {
      form.append("revision", String(preview.database.revision));
      form.append("hash", preview.hash);
      form.append("requestId", requestId.current);
    }
    try {
      if (action === "preview") {
        const result = await fetchJson<ImportPreview>("/api/import", {
          method: "POST",
          body: form,
        });
        setPreview(result);
        requestId.current = newRequestId();
        setAgree(false);
      } else {
        await fetchJson("/api/import", { method: "POST", body: form });
        onSuccess();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Configurações"
      subtitle="Importação da programação de produção"
      onClose={onClose}
      busy={busy}
      wide
    >
      <div className="modal-body">
        <div className="import-intro">
          <div className="import-icon">
            <FileSpreadsheet size={25} />
          </div>
          <div>
            <h3>Atualizar programação</h3>
            <p>
              Selecione a exportação original do Excel. As colunas são
              identificadas automaticamente.
            </p>
          </div>
        </div>
        {!connected && (
          <div className="info-banner">
            A conexão ainda não está disponível. Você pode validar o Excel
            agora; a gravação será liberada após conectar o banco.
          </div>
        )}
        <label className="upload-zone">
          <Upload size={26} />
          <strong>{file ? file.name : "Selecione sua planilha"}</strong>
          <span>Excel .xls ou .xlsx · até 4 MB · até 10.000 linhas</span>
          <input
            aria-label="Selecionar planilha Excel"
            type="file"
            accept=".xls,.xlsx"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPreview(null);
              setError("");
              setAgree(false);
            }}
          />
        </label>
        <button
          className="secondary validate-button"
          disabled={!file || busy}
          onClick={() => send("preview")}
        >
          <CheckCircle2 size={16} />
          {busy ? "Processando..." : "Validar e visualizar prévia"}
        </button>
        {error && (
          <div className="error-inline multiline" role="alert">
            {error}
          </div>
        )}
        {preview && (
          <div className="import-preview">
            <div className="preview-title">
              <CheckCircle2 size={18} />
              <b>Arquivo validado</b>
              <span>Cabeçalho na linha {preview.headerRow}</span>
            </div>
            <div className="preview-numbers">
              <div>
                <strong>{numberLabel(preview.rows)}</strong>
                <small>programações</small>
              </div>
              <div>
                <strong>{numberLabel(preview.ops)}</strong>
                <small>ordens de produção</small>
              </div>
              <div>
                <strong>{numberLabel(preview.units)}</strong>
                <small>unidades</small>
              </div>
            </div>
            <p className="muted">
              {dateLabel(preview.start)} <ArrowRight size={13} />{" "}
              {dateLabel(preview.end)}
            </p>
            <div className="preview-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>OP-Pai</th>
                    <th>Cliente</th>
                    <th>Programada</th>
                    <th>Qtd.</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r, i) => (
                    <tr key={i}>
                      <td>{r.op_pai}</td>
                      <td>{r.nome_cliente}</td>
                      <td>{dateLabel(r.data_programada)}</td>
                      <td>{r.qtd_programada}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small className="muted">
              Prévia das primeiras {preview.sample.length} linhas.
            </small>
            {preview.warnings.length > 0 && (
              <details className="import-warnings">
                <summary>
                  {preview.warnings.length} observação sobre a programação
                </summary>
                {preview.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </details>
            )}
            {preview.database && (
              <>
                <div className="replace-notice">
                  <AlertTriangle size={20} />
                  <div>
                    <b>Esta importação substitui toda a programação atual.</b>
                    <p>
                      {preview.database.preserved} OPs preservadas ·{" "}
                      {preview.database.created} novas ·{" "}
                      <strong>{preview.database.removed} removidas</strong>.
                    </p>
                    <p>
                      {preview.database.removed_records} registros de
                      apontamento serão excluídos com as OPs ausentes. A
                      produção das OPs mantidas será redistribuída por data
                      (FIFO).
                    </p>
                  </div>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={agree}
                    disabled={busy}
                    onChange={(e) => setAgree(e.target.checked)}
                  />
                  Revisei a prévia e confirmo a substituição da programação.
                </label>
              </>
            )}
          </div>
        )}
        <div className="modal-actions">
          <button className="secondary" disabled={busy} onClick={onClose}>
            Fechar
          </button>
          <button
            className="primary"
            disabled={busy || !preview?.database || !agree}
            onClick={() => send("confirm")}
          >
            <Upload size={16} />
            {busy ? "Processando..." : "Confirmar importação"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
