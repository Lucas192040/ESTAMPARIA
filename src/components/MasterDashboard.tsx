"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/client";
import type { DailyDataset, Order } from "@/lib/types";

type FerragemRow = {
 id:number; nro_op:string; op_pai:string; nome_cliente:string; status_op:string;
 data_programada:string; qtd_programada:number; produto:string; descr_produto:string;
 referencia_prod:string; potencia_pa:number; linha_prod:string;
 viga_superior:number; viga_inferior:number; dobradeira_superior:number; dobradeira_inferior:number;
};
const fmtDate=(v:string)=>{if(!v)return "—";const s=String(v).slice(0,10);const a=s.split("-");return a.length===3?`${a[2]}/${a[1]}/${a[0]}`:s;};
function Stat({label,value}:{label:string;value:number}){return <div className="summary-card"><span>{label}</span><strong>{value.toLocaleString("pt-BR")}</strong></div>;}
function Rows({rows}:{rows:Order[]}){return <div className="master-list">{rows.map((r:any,i)=><article className="order-card" key={r.id??i}><div className="order-card-header"><strong>OP {r.op_pai??r.nro_op??"—"}</strong><span>{fmtDate(r.data_inicial??r.data_programada)}</span></div><div className="card-details"><div><small>Cliente</small><strong>{r.nome_cliente??"—"}</strong></div><div><small>Referência / Produto</small><strong>{r.referencia_prod??r.descr_produto??"—"}</strong></div><div><small>Quantidade</small><strong>{Number(r.qtd_programada??r.quantidade_total??0).toLocaleString("pt-BR")}</strong></div><div><small>Status</small><strong>{r.status??r.status_op??"Programado"}</strong></div></div></article>)}</div>}
export default function MasterDashboard(){
 const [daily,setDaily]=useState<DailyDataset|null>(null),[ferr,setFerr]=useState<FerragemRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const reload=useCallback(async()=>{setLoading(true);setError("");try{const [d,f]=await Promise.all([fetchJson<DailyDataset>("/api/ops?dataset=1&fresh=1"),fetchJson<{rows:FerragemRow[]}>("/api/ferragem")]);setDaily(d);setFerr(f.rows??[]);}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{void reload();},[reload]);
 const est=daily?.rows.filter((r:any)=>!String(r.linha_prod??"").toUpperCase().startsWith("TRI"))??[];
 const rad=daily?.rows.filter((r:any)=>String(r.linha_prod??"").toUpperCase().startsWith("TRI"))??[];
 async function logout(){try{await fetchJson("/api/auth/logout",{method:"POST"});window.location.assign("/login");}catch(e){setError((e as Error).message);}}
 return <main className="app-shell"><header className="topbar"><a href="/master" className="brand"><img src="/logo-itam-compact.webp" alt="ITAM Transformadores" className="brand-logo" width="480" height="216"/><div><h1>MASTER<span className="brand-dot">.</span></h1><p>Visão geral da produção</p></div></a><div className="topbar-actions"><span className="master-readonly">Somente visualização</span><button className="secondary" onClick={()=>void reload()}>Atualizar</button><button className="secondary" onClick={()=>void logout()}>Sair</button></div></header>
 <section className="page-heading"><div><h2>Acompanhamento dos três processos</h2><p>Estamparia, Radiador e Ferragem em uma única tela. Este acesso não permite apontamentos nem alterações.</p></div></section>
 {error&&<div className="error-inline" role="alert">{error}</div>}{loading&&<p>Carregando dados dos processos...</p>}
 {!loading&&<><section className="master-process"><div className="master-process-title"><h2>Estamparia</h2><span>{est.length} registros</span></div><Rows rows={est as Order[]}/></section><section className="master-process"><div className="master-process-title"><h2>Radiador</h2><span>{rad.length} registros</span></div><Rows rows={rad as Order[]}/></section><section className="master-process"><div className="master-process-title"><h2>Ferragem</h2><span>{ferr.length} registros</span></div><div className="master-list">{ferr.map(r=><article className="order-card" key={r.id}><div className="order-card-header"><strong>OP {r.op_pai} · {r.nro_op}</strong><span>{fmtDate(r.data_programada)}</span></div><div className="card-details"><div><small>Cliente</small><strong>{r.nome_cliente}</strong></div><div><small>Produto</small><strong>{r.descr_produto||r.produto}</strong></div><div><small>Quantidade programada</small><strong>{r.qtd_programada}</strong></div><div><small>Apontamentos (viga sup./inf.)</small><strong>{r.viga_superior} / {r.viga_inferior}</strong></div><div><small>Dobradeira (sup./inf.)</small><strong>{r.dobradeira_superior} / {r.dobradeira_inferior}</strong></div><div><small>Status</small><strong>{r.status_op}</strong></div></div></article>)}</div></section></>}
 </main>;
}
