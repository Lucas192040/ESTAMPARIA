"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Settings2,
  RotateCcw,
  SlidersHorizontal,
  LayoutGrid,
  Table2,
  ChevronLeft,
  ChevronRight,
  Upload,
  ArrowUpRight,
  Clock3,
  CheckCircle2,
  Activity,
  AlertCircle,
  RefreshCw,
  Layers3,
  Factory,
  LogOut,
} from "lucide-react";
import {
  EMPTY_FILTERS,
  type Filters,
  type Listing,
  type Order,
  STATUS_LABEL,
  type Status,
} from "@/lib/types";
import { dateLabel, numberLabel } from "@/lib/domain";
import OrderCard from "./OrderCard";
import OrderTable from "./OrderTable";
import { fetchJson } from "@/lib/client";
import dynamic from "next/dynamic";
import { filterDailyDataset } from "@/lib/daily-listing";
import type { DailyDataset } from "@/lib/types";
// The modal and Excel import UI are not needed during first paint.
const ImportPanel = dynamic(() => import("./ImportPanel"), { ssr: false });
const ProductionModal = dynamic(() => import("./ProductionModal"), { ssr: false });
const RadiatorModal = dynamic(() => import("./RadiatorModal"), { ssr: false });
export default function Dashboard({ mode }: { mode: "estamparia" | "radiador" }) {
  const [connected, setConnected] = useState<boolean | null>(null),
    [filters, setFilters] = useState<Filters>(EMPTY_FILTERS),
    [dataset, setDataset] = useState<DailyDataset | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [settings, setSettings] = useState(false),
    [mobileFilters, setMobileFilters] = useState(false),
    [view, setView] = useState<"table" | "grid">("table"),
    [refresh, setRefresh] = useState(0),
    [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{
    order: Order;
    mode: "adicionar" | "corrigir";
    schedule?: number;
  } | null>(null);
  // Local filtering is shared with the previous server-side listing logic.
  // Search, sorting and pagination now consume zero API/Neon requests.
  const data = useMemo<Listing | null>(
    () => dataset ? filterDailyDataset(dataset, filters, mode) : null,
    [dataset, filters, mode],
  );
  const forceNext = useRef(false);
  const lastSuccessfulRefresh = useRef(0);
  const reload = useCallback(() => setRefresh((v) => v + 1), []);
  // No polling. On returning to a tab, refresh at most once every two minutes.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine &&
          Date.now() - lastSuccessfulRefresh.current > 120_000) {
        forceNext.current = true;
        reload();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const ac = new AbortController();
    // No 400ms delay: first load and explicit refresh start immediately.
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ dataset: "1" });
        // Depois de uma gravação, consultar dados atuais independentemente do
        // cache curto mantido nas instâncias serverless.
        if (forceNext.current) {
          params.set("fresh", "1");
        }
        const result = await fetchJson<DailyDataset & { connected: boolean }>(
          `/api/ops?${params}`,
          { signal: ac.signal },
        );
        forceNext.current = false;
        lastSuccessfulRefresh.current = Date.now();
        setConnected(result.connected);
        setDataset(result.connected ? result : null);
      } catch (e) {
        if (!ac.signal.aborted) {
          setConnected(false);
          setError((e as Error).message);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => ac.abort();
  }, [refresh]);
  const update = (key: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value, pagina: 1 }));
  const active = Object.entries(filters).filter(
    ([k, v]) => !["ordem", "pagina"].includes(k) && v !== "",
  ).length;
  async function logout() {
    try { await fetchJson("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }
    catch (e) { setError((e as Error).message); }
  }
  async function markNoRadiator(order: Order) {
    if (mode !== "radiador" || !window.confirm(`Confirmar que a OP ${order.op_pai}, em ${dateLabel(order.data_inicial)}, não necessita de radiador? A programação será finalizada sem alterar as quantidades.`)) return;
    try {
      await fetchJson("/api/radiador/sem-necessidade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ programacaoIds: order.programacoes.map((p) => p.id) }) });
      success("Programação finalizada: não necessita de radiador.");
    } catch (e) { setError((e as Error).message); }
  }
  function success(message: string) {
    setNotice(message);
    forceNext.current = true;
    reload();
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href={`/${mode}`} className="brand" aria-label={`ITAM Transformadores — ${mode}, início`}>
          <img
            src="/logo-itam-compact.webp"
            alt="ITAM Transformadores"
            className="brand-logo"
            width="480"
            height="216"
          />
          <div>
            <h1>
              {mode === "radiador" ? "Radiador" : "Estamparia"}<span className="brand-dot">.</span>
            </h1>
            <p>Acompanhamento da Produção</p>
          </div>
        </a>
        <div className="search-box">
          <Search size={19} />
          <input
            aria-label="Pesquisa geral"
            placeholder="Buscar por OP, cliente, referência ou série..."
            value={filters.q}
            onChange={(e) => update("q", e.target.value)}
          />
        </div>
        {mode === "estamparia" && <button className="secondary settings-button" onClick={() => setSettings(true)}>
          <Settings2 size={17} /><span>Configurações</span>
        </button>}
        <button className="secondary settings-button" onClick={() => void logout()}><LogOut size={16}/> <span>Sair</span></button>
      </header>
      <main>
        <div className="page-heading">
          <div className="eyebrow">
            <span className="live-dot" />
            CHÃO DE FÁBRICA <span className="slash">/</span> {mode === "radiador" ? "RADIADOR" : "ESTAMPARIA"}
          </div>
          <div className="page-title-row">
            <div>
              <h2>Visão da produção</h2>
              <p>{mode === "radiador" ? "Apontamento de Radiador e progresso da Estamparia por OP." : "Da programação à peça pronta. Acompanhe também o Radiador."}</p>
            </div>
            <div className="sync">
              <span className={`connection-dot ${connected ? "green" : ""}`} />
              {connected
                ? "Conectado"
                : connected === false
                  ? "Conexão pendente"
                  : "Verificando conexão"}
              <button
                className="icon-button"
                aria-label="Atualizar dados"
                disabled={loading}
                onClick={reload}
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
              </button>
            </div>
          </div>
        </div>
        <div className="summary-grid">
          {(
            [
              {
                status: "EM_ANDAMENTO",
                icon: Activity,
                label: "Em andamento",
                caption: "Datas com produção em execução",
                color: "blue",
              },
              {
                status: "ATRASADA",
                icon: Clock3,
                label: "Atrasadas",
                caption: "Datas programadas em atraso",
                color: "red",
              },
              {
                status: "CONCLUIDA",
                icon: CheckCircle2,
                label: "Concluídas",
                caption: mode === "radiador" ? "Radiadores concluídos por data" : "Datas com subsetores finalizados",
                color: "green",
              },
              {
                status: "NAO_INICIADA",
                icon: Layers3,
                label: "Não iniciadas",
                caption: "Datas aguardando apontamento",
                color: "gray",
              },
            ] as const
          ).map(({ status, icon: Icon, label, caption, color }) => (
            <button
              key={status}
              className={`summary ${filters.situacao === status ? "selected" : ""}`}
              onClick={() =>
                update("situacao", filters.situacao === status ? "" : status)
              }
            >
              <div className="summary-top">
                <span>{label}</span>
                <Icon size={18} className={color} />
              </div>
              <strong>
                {connected && data ? numberLabel(data.counts[status]) : "—"}
              </strong>
              <small>{caption}</small>
            </button>
          ))}
        </div>
        <section className="filter-panel" aria-label="Filtros de produção">
          <div className="filter-heading">
            <button
              className="text-button filter-toggle"
              onClick={() => setMobileFilters((v) => !v)}
              aria-expanded={mobileFilters}
            >
              <SlidersHorizontal size={15} />
              Filtros
              {active > 0 && <span className="filter-count">{active}</span>}
            </button>
            <button
              className="text-button clear"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              <RotateCcw size={13} />
              Limpar filtros
            </button>
          </div>
          <div className={`filters ${mobileFilters ? "mobile-open" : ""}`}>
            <label>
              OP-Pai
              <input
                placeholder="Ex.: 43107"
                value={filters.op}
                onChange={(e) => update("op", e.target.value)}
              />
            </label>
            <label>
              Série
              <input
                inputMode="numeric"
                placeholder="Número da série"
                value={filters.serie}
                onChange={(e) =>
                  update(
                    "serie",
                    e.target.value.replace(/\D/g, "").slice(0, 15),
                  )
                }
              />
            </label>
            <label>
              Cliente
              <select
                value={filters.cliente}
                onChange={(e) => update("cliente", e.target.value)}
              >
                <option value="">Todos os clientes</option>
                {data?.options.clientes.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Potência PA
              <select
                value={filters.potencia}
                onChange={(e) => update("potencia", e.target.value)}
              >
                <option value="">Todas</option>
                {data?.options.potencias.map((p) => (
                  <option key={p} value={p}>
                    {numberLabel(p)} kVA
                  </option>
                ))}
              </select>
            </label>
            <label>
              Linha Prod.
              <select
                value={filters.linha}
                onChange={(e) => update("linha", e.target.value)}
              >
                <option value="">Todas</option>
                {data?.options.linhas.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              Programada de
              <input
                aria-label="Data programada inicial"
                type="date"
                value={filters.inicio}
                onChange={(e) => update("inicio", e.target.value)}
              />
            </label>
            <label>
              Até
              <input
                aria-label="Data programada final"
                type="date"
                value={filters.fim}
                onChange={(e) => update("fim", e.target.value)}
              />
            </label>
            <label>
              Situação
              <select
                value={filters.situacao}
                onChange={(e) => update("situacao", e.target.value)}
              >
                <option value="">Todas</option>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <div className="results-toolbar">
          <div>
            <strong>{data ? numberLabel(data.total) : "0"}</strong> programações
            diárias{" "}
            <span className="muted">
              {active > 0 ? "· filtros aplicados" : "· programação atual"}
            </span>
          </div>
          <div className="sort-tools">
            <label>
              <span>Ordenar por</span>
              <select
                aria-label="Ordenação"
                value={filters.ordem}
                onChange={(e) => update("ordem", e.target.value)}
              >
                <option value="data_asc">Data mais antiga</option>
                <option value="data_desc">Data mais recente</option>
                <option value="op_asc">OP crescente</option>
                <option value="op_desc">OP decrescente</option>
                <option value="situacao">Situação</option>
              </select>
            </label>
            <div className="view-toggle">
              <button
                aria-label="Visualizar em tabela"
                title="Tabela"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                <Table2 size={17} />
              </button>
              <button
                aria-label="Visualizar em cartões"
                title="Cartões"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={18} />
              </button>
            </div>
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={19} />
            <span>{error}</span>
            <button onClick={reload}>Tentar novamente</button>
          </div>
        )}
        {loading && !data ? (
          <div className="loading-state" role="status">
            <RefreshCw className="spin" />
            Carregando a programação...
          </div>
        ) : data?.items.length ? (
          view === "table" ? (
            <div className={loading ? "refreshing" : ""} aria-busy={loading}>
              <OrderTable
                mode={mode}
                items={data.items}
                onAction={(order, mode, schedule) => setEditing({ order, mode, schedule })}
                onNoNeed={markNoRadiator}
              />
            </div>
          ) : (
            <div className={`orders ${loading ? "refreshing" : ""}`} aria-busy={loading}>
              {data.items.map((order) => (
                <OrderCard
                  mode={mode}
                  key={`${order.id}:${order.data_inicial}`}
                  order={order}
                  onAction={(order, mode, schedule) => setEditing({ order, mode, schedule })}
                  onNoNeed={markNoRadiator}
                />
              ))}
            </div>
          )
        ) : (
          !error && (
            <section className="empty-state">
              <div className="empty-illustration">
                <div className="empty-sheet">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="empty-icon">
                  <Factory size={31} strokeWidth={1.4} />
                </div>
              </div>
              <span className="eyebrow">
                {active ? "BUSCA NA PROGRAMAÇÃO" : "TUDO PRONTO PARA COMEÇAR"}
              </span>
              <h3>
                {active ? "Nenhuma OP encontrada" : "Sua produção começa aqui"}
              </h3>
              <p>
                {active
                  ? "Ajuste os filtros para encontrar outras ordens de produção."
                  : mode === "radiador" ? "A programação da Estamparia aparecerá aqui após a importação feita no setor autorizado." : "Importe a programação em Configurações para acompanhar as ordens e apontar a produção dos quatro subsetores."}
              </p>
              {(active || mode === "estamparia") && <button
                className="primary"
                onClick={() => active ? setFilters(EMPTY_FILTERS) : setSettings(true)}
              >
                {active ? <RotateCcw size={17} /> : <Upload size={17} />}{" "}
                {active ? "Limpar filtros" : "Importar programação"}
                <ArrowUpRight size={16} />
              </button>}
              {!active && mode === "estamparia" && (
                <div className="empty-sectors">
                  <span>CORPO</span>
                  <i />
                  <span>FUNDO</span>
                  <i />
                  <span>TAMPA</span>
                  <i />
                  <span>TAMPA BORDEADA</span>
                </div>
              )}
            </section>
          )
        )}
        {data && data.paginas > 1 && (
          <nav className="pagination" aria-label="Paginação">
            <span>
              Página {data.pagina} de {data.paginas}
            </span>
            <button
              className="secondary"
              disabled={loading || filters.pagina === 1}
              onClick={() =>
                setFilters((f) => ({ ...f, pagina: f.pagina - 1 }))
              }
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <button
              className="secondary"
              disabled={loading || filters.pagina >= data.paginas}
              onClick={() =>
                setFilters((f) => ({ ...f, pagina: f.pagina + 1 }))
              }
            >
              Próxima
              <ChevronRight size={16} />
            </button>
          </nav>
        )}
        <footer className="footer">
          <span>
            <span className="footer-dot" />
            {mode === "radiador" ? "RADIADOR" : "ESTAMPARIA"} <span className="muted">/ Controle de produção</span>
          </span>
          <span>
            {data?.ultima_importacao
              ? `Última importação: ${new Date(data.ultima_importacao.realizado_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}`
              : "Nenhuma programação importada"}
            <span className="footer-zone">Manaus · UTC−4</span>
          </span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {settings && mode === "estamparia" && (
        <ImportPanel
          connected={!!connected}
          onClose={() => setSettings(false)}
          onSuccess={() => {
            setSettings(false);
            success("Programação importada e apontamentos redistribuídos.");
          }}
        />
      )}
      {editing && mode === "estamparia" && (
        <ProductionModal
          {...editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            success("Produção salva com sucesso.");
          }}
        />
      )}
      {editing && mode === "radiador" && (
        <RadiatorModal {...editing} onClose={() => setEditing(null)} onSuccess={() => {
          setEditing(null); success("Radiador salvo com sucesso.");
        }} />
      )}
    </div>
  );
}
