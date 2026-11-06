"use client";
import { useCallback,useEffect,useMemo,useState } from "react";
import { fetchJson } from "@/lib/client";
import type { DailyDataset,Order,Schedule } from "@/lib/types";
type F={id:number;nro_op:string;op_pai:string;nome_cliente:string;status_op:string;data_programada:string;qtd_programada:number;produto:string;descr_produto:string;viga_superior:number;viga_inferior:number;dobradeira_superior:number;dobradeira_inferior:number};
type T={planned:number;done:number;pending:number;orders:number};

type View="overview"|"estamparia"|"radiador"|"ferragem";
type Activity={estamparia:string|null;radiador:string|null;ferragem:string|null;timezone:string};
type ShiftDay={date:string;first:number;second:number;total:number};
type SectorMetric={name:string;planned:number;done:number;pending:number;percent:number;id:number;color:string};
function EstampariaSectors({rows,today}:{rows:Order[];today:string}){
 const defs=[{id:1,name:"CORPO",color:"blue"},{id:2,name:"FUNDO",color:"purple"},{id:3,name:"TAMPA",color:"cyan"},{id:4,name:"TAMPA BORDEADA",color:"amber"}];
 const metrics:SectorMetric[]=defs.map(d=>{let planned=0,done=0;for(const order of rows)for(const p of order.programacoes){planned+=Number(p.qtd_programada||0);done+=Number(p.setores.find(s=>s.subsetor_id===d.id)?.qtd_apontada||0)}return {...d,planned,done,pending:Math.max(0,planned-done),percent:planned?Math.min(100,Math.round(done/planned*100)):0}});
 const planned=metrics.reduce((sum,m)=>sum+m.planned,0),done=metrics.reduce((sum,m)=>sum+m.done,0),pending=Math.max(0,planned-done),percent=planned?Math.min(100,Math.round(done/planned*100)):0;
 const overdue=rows.flatMap(order=>order.programacoes).filter(p=>p.data_programada<today&&finished(p)<p.qtd_programada);
 const overduePieces=overdue.reduce((sum,p)=>sum+Math.max(0,p.qtd_programada-finished(p)),0);
 return <><div className="master-sector-summary-row"><section className="master-sector-overview"><div className="master-sector-overview-label"><span>✓</span><strong>Resumo Geral do Mês</strong></div><div><span>PROGRAMADA</span><strong>{n(planned)}</strong></div><div><span>REALIZADA</span><strong className="master-done">{n(done)}</strong></div><div><span>PENDENTE</span><strong className="master-pending">{n(pending)}</strong></div><div className="master-sector-overall-progress"><strong style={{background:`conic-gradient(#19ddb0 ${percent}%, #244b66 ${percent}%)`}}>{percent}%</strong><small>Conclusão do Mês</small><div className="master-metric-track"><span style={{width:percent+"%"}}/></div></div></section><aside className="master-overdue-card"><span>💡 Peças Atrasadas</span><strong>{n(overduePieces)}</strong><small>{n(overdue.length)} programações vencidas</small></aside></div>
 <section className="master-sector-cards">{metrics.map(m=><article className={"master-sector-card sector-"+m.color} key={m.id}><div className="master-sector-card-title"><span className="master-sector-symbol">{m.id===1?"▰":m.id===2?"◉":m.id===3?"▤":"▱"}</span><strong>{m.name}</strong><span className="master-metric-tag">● Produção</span></div><div className="master-sector-values"><div><small>Programada</small><strong>{n(m.planned)}</strong></div><div><small>Realizada</small><strong className="master-done">{n(m.done)}</strong></div><div><small>Pendente</small><strong className="master-pending">{n(m.pending)}</strong></div></div><div className="master-metric-track"><span style={{width:m.percent+"%"}}/></div><div className="master-sector-foot"><span>{m.percent}% concluído</span><span>{n(m.planned)} previstas</span></div></article>)}</section></>;
}

function ShiftDailyChart({rows,activity}:{rows:ShiftDay[];activity:string|null}){
 const saved=shift(activity);
 const total1=rows.reduce((sum,x)=>sum+x.first,0),total2=rows.reduce((sum,x)=>sum+x.second,0);
 const peak=Math.max(0,...rows.map(x=>Math.max(x.first,x.second)));
 const chartMax=Math.max(1500,Math.ceil(peak/500)*500);
 const ticks=[chartMax,Math.round(chartMax*2/3/500)*500,Math.round(chartMax/3/500)*500,0];
 const height=(value:number)=>Math.max(value>0?2:0,value/chartMax*100);
 return <><section className="master-shift-daily">
  <div className="master-section-heading"><div><span className="master-kicker">PRODUÇÃO POR DIA E TURNO</span><h2>Produção por Dia e Turno</h2></div><div className="master-shift-chart-legend"><span><i className="first-dot"/>1º Turno</span><span><i className="second-dot"/>2º Turno</span></div></div>
  {rows.length===0?<p className="master-shift-empty">Ainda não há produção concluída registrada neste mês.</p>:<div className="master-shift-chart-shell">
   <div className="master-shift-y-axis">{ticks.map((tick,index)=><span key={index}>{n(tick)}</span>)}</div>
   <div className="master-shift-chart-plot"><div className="master-shift-grid-lines"><i/><i/><i/><i/></div>
    <div className="master-shift-chart">{rows.map(x=><div className="master-shift-day" key={x.date}>
     <div className="master-shift-day-bars">
      <div className="master-shift-column"><span>{n(x.first)}</span><i className="master-shift-bar first" style={{height:height(x.first)+"%"}} title={"1º turno: "+n(x.first)}/></div>
      <div className="master-shift-column"><span>{n(x.second)}</span><i className="master-shift-bar second" style={{height:height(x.second)+"%"}} title={"2º turno: "+n(x.second)}/></div>
     </div><small>{date(x.date)}</small>
    </div>)}</div>
   </div>
  </div>}
 </section>
 <div className="master-daily-bottom"><section className="master-daily-table-panel"><div className="master-section-heading"><div><span className="master-kicker">ACOMPANHAMENTO DIÁRIO</span><h2>Resumo Diário da Estamparia</h2></div></div>
  <div className="master-shift-table-wrap"><table className="master-shift-table"><thead><tr><th>Data</th><th>1º Turno (07:00–17:15)</th><th>2º Turno (17:20–02:48)</th><th>Total do Dia</th></tr></thead><tbody>{rows.map(x=><tr key={x.date}><td>{date(x.date)}</td><td>{n(x.first)}</td><td>{n(x.second)}</td><td><strong>{n(x.total)}</strong></td></tr>)}</tbody></table></div>
 </section>
 <aside className="master-daily-info"><div className="master-section-heading"><div><span className="master-daily-info-icon">☼</span><h2>Informações Importantes</h2></div></div>
  <div className="master-info-shifts"><article><span>◷</span><div><b>1º Turno</b><strong>07:00 às 17:15</strong></div></article><article><span>◷</span><div><b>2º Turno</b><strong>17:20 às 02:48</strong></div></article></div>
  <div className="master-info-last"><span className="master-info-check">✓</span><div><b>Último registro da Estamparia:</b><strong>{saved.label==="Sem apontamento"?"Nenhum apontamento registrado":saved.date+" às "+saved.time+" – "+saved.label}</strong></div></div>
 </aside></div></>;
}

type DailyProduction={date:string;planned:number;done:number;pending:number};
function MasterSummary({planned,done,pending,percent,overduePieces,overdueCount}:{planned:number;done:number;pending:number;percent:number;overduePieces:number;overdueCount:number}){
 return <div className="master-sector-summary-row"><section className="master-sector-overview">
  <div className="master-sector-overview-label"><span>✓</span><strong>Resumo Geral do Mês</strong></div>
  <div><span>PROGRAMADA</span><strong>{n(planned)}</strong></div>
  <div><span>REALIZADA</span><strong className="master-done">{n(done)}</strong></div>
  <div><span>PENDENTE</span><strong className="master-pending">{n(pending)}</strong></div>
  <div className="master-sector-overall-progress"><strong style={{background:`conic-gradient(#19ddb0 ${percent}%, #244b66 ${percent}%)`}}>{percent}%</strong><small>Conclusão do Mês</small><div className="master-metric-track"><span style={{width:percent+"%"}}/></div></div>
 </section><aside className="master-overdue-card"><span>💡 Peças Atrasadas</span><strong>{n(overduePieces)}</strong><small>{n(overdueCount)} programações vencidas</small></aside></div>;
}
function MasterProductionCard({name,planned,done,color,icon}:{name:string;planned:number;done:number;color:string;icon:string}){
 const pending=Math.max(0,planned-done),percent=planned?Math.min(100,Math.round(done/planned*100)):0;
 return <article className={"master-sector-card sector-"+color}><div className="master-sector-card-title"><span className="master-sector-symbol">{icon}</span><strong>{name}</strong><span className="master-metric-tag">● Produção</span></div>
  <div className="master-sector-values"><div><small>Programada</small><strong>{n(planned)}</strong></div><div><small>Realizada</small><strong className="master-done">{n(done)}</strong></div><div><small>Pendente</small><strong className="master-pending">{n(pending)}</strong></div></div>
  <div className="master-metric-track"><span style={{width:percent+"%"}}/></div><div className="master-sector-foot"><span>{percent}% concluído</span><span>{n(planned)} previstas</span></div>
 </article>;
}
function MasterDailyHistory({rows,activity,processName}:{rows:DailyProduction[];activity:string|null;processName:string}){
 const saved=shift(activity),max=Math.max(1,...rows.map(x=>Math.max(x.planned,x.done))),chartMax=Math.max(1000,Math.ceil(max/500)*500);
 const ticks=[chartMax,Math.round(chartMax*2/3/500)*500,Math.round(chartMax/3/500)*500,0];
 const height=(v:number)=>v?Math.max(2,v/chartMax*100):0;
 return <>
  <section className="master-shift-daily">
   <div className="master-section-heading"><div><span className="master-kicker">ACOMPANHAMENTO DIÁRIO</span><h2>Produção por Dia – {processName}</h2></div><div className="master-history-legend"><span><i className="planned-dot"/>Programada</span><span><i className="done-dot"/>Realizada</span></div></div>
   {rows.length===0?<p className="master-shift-empty">Não há produção registrada neste mês.</p>:<div className="master-shift-chart-shell"><div className="master-shift-y-axis">{ticks.map((v,i)=><span key={i}>{n(v)}</span>)}</div><div className="master-shift-chart-plot"><div className="master-shift-grid-lines"><i/><i/><i/><i/></div><div className="master-shift-chart">{rows.map(x=><div className="master-shift-day" key={x.date}><div className="master-shift-day-bars master-total-bars"><div className="master-shift-column"><span>{n(x.planned)}</span><i className="master-shift-bar planned" style={{height:height(x.planned)+"%"}}/></div><div className="master-shift-column"><span>{n(x.done)}</span><i className="master-shift-bar done" style={{height:height(x.done)+"%"}}/></div></div><small>{date(x.date)}</small></div>)}</div></div></div>}
  </section>
  <div className="master-daily-bottom"><section className="master-daily-table-panel"><div className="master-section-heading"><div><span className="master-kicker">DETALHAMENTO DO MÊS</span><h2>Resumo Diário – {processName}</h2></div></div>
   <div className="master-shift-table-wrap"><table className="master-shift-table"><thead><tr><th>Data</th><th>Programada</th><th>Realizada</th><th>Pendente</th></tr></thead><tbody>{rows.map(x=><tr key={x.date}><td>{date(x.date)}</td><td>{n(x.planned)}</td><td>{n(x.done)}</td><td><strong className="master-pending">{n(x.pending)}</strong></td></tr>)}</tbody></table></div>
  </section>
  <aside className="master-daily-info"><div className="master-section-heading"><span className="master-daily-info-icon">☼</span><h2>Informações Importantes</h2></div>
   <div className="master-info-shifts"><article><span>◷</span><div><b>1º Turno</b><strong>07:00 às 17:15</strong></div></article><article><span>◷</span><div><b>2º Turno</b><strong>17:20 às 02:48</strong></div></article></div>
   <div className="master-info-last"><span className="master-info-check">✓</span><div><b>Último registro de {processName}:</b><strong>{saved.label==="Sem apontamento"?"Nenhum apontamento registrado":saved.date+" às "+saved.time+" – "+saved.label}</strong></div></div>
  </aside></div>
 </>;
}
function MasterCountCard({name,value,caption,color,icon}:{name:string;value:number;caption:string;color:string;icon:string}){
 return <article className={"master-sector-card sector-"+color+" master-count-card"}><div className="master-sector-card-title"><span className="master-sector-symbol">{icon}</span><strong>{name}</strong><span className="master-metric-tag">● Indicador</span></div><strong className="master-count-value">{n(value)}</strong><small>{caption}</small></article>;
}
function MasterOverviewCard({name,planned,done,color,icon,activity}:{name:string;planned:number;done:number;color:string;icon:string;activity:string|null}){
 const pending=Math.max(0,planned-done),percent=planned?Math.min(100,Math.round(done/planned*100)):0,saved=shift(activity);
 return <article className={"master-sector-card sector-"+color+" master-overview-process-card"}>
  <div className="master-sector-card-title"><span className="master-sector-symbol">{icon}</span><strong>{name}</strong><span className="master-metric-tag">● Processo</span></div>
  <div className="master-sector-values"><div><small>Programada</small><strong>{n(planned)}</strong></div><div><small>Realizada</small><strong className="master-done">{n(done)}</strong></div><div><small>Pendente</small><strong className="master-pending">{n(pending)}</strong></div></div>
  <div className="master-metric-track"><span style={{width:percent+"%"}}/></div>
  <div className="master-sector-foot"><span>{percent}% concluído</span><span>{n(planned)} previstas</span></div>
  <div className="master-overview-last"><small>ÚLTIMO REGISTRO</small><strong className={saved.label==="Sem apontamento"?"":saved.label==="Fora do turno"?"master-shift-off":"master-shift-on"}>{saved.label}</strong><span>{activity?saved.date+" · "+saved.time:"Aguardando primeiro apontamento"}</span></div>
 </article>;
}
function RadiadorMasterPanel({rows,today,activity,selectedMonth}:{rows:Order[];today:string;activity:string|null;selectedMonth:string}){
 let planned=0,done=0,overduePieces=0,overdueCount=0,completed=0,inProgress=0,noNeed=0,notStarted=0;
 const byDate=new Map<string,DailyProduction>();
 for(const order of rows)for(const p of order.programacoes){
  if(!p.data_programada.startsWith(selectedMonth))continue;
  const qty=p.radiador_nao_necessario?0:Number(p.qtd_programada||0),actual=p.radiador_nao_necessario?0:Math.min(qty,Number(p.radiador?.qtd_apontada||0));
  planned+=qty;done+=actual;
  if(p.radiador_nao_necessario)noNeed++;
  else if(actual>=qty&&qty>0)completed++;
  else if(actual>0)inProgress++;
  else notStarted++;
  if(!p.radiador_nao_necessario&&p.data_programada<today&&actual<qty){overdueCount++;overduePieces+=qty-actual;}
  if(!p.radiador_nao_necessario){const d=byDate.get(p.data_programada)??{date:p.data_programada,planned:0,done:0,pending:0};d.planned+=qty;d.done+=actual;d.pending+=Math.max(0,qty-actual);byDate.set(p.data_programada,d);}
 }
 const pending=Math.max(0,planned-done),percent=planned?Math.min(100,Math.round(done/planned*100)):0;
 const totalSchedules=completed+inProgress+notStarted;
 const daily=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
 return <><MasterSummary planned={planned} done={done} pending={pending} percent={percent} overduePieces={overduePieces} overdueCount={overdueCount}/>
  <section className="master-sector-cards master-radiador-cards">
   <MasterCountCard name="RADIADOR" value={planned} caption="Peças previstas para o processo" color="blue" icon="▤"/>
   <MasterCountCard name="CONCLUÍDAS" value={completed} caption="Programações finalizadas" color="purple" icon="✓"/>
   <MasterCountCard name="EM ANDAMENTO" value={inProgress} caption="Programações com produção iniciada" color="cyan" icon="◷"/>
   <MasterCountCard name="SEM NECESSIDADE" value={noNeed} caption="Programações liberadas do Radiador" color="amber" icon="○"/>
  </section>
  <MasterDailyHistory rows={daily} activity={activity} processName="Radiador"/>
 </>;
}
function FerragemMasterPanel({rows,today,activity,selectedMonth}:{rows:F[];today:string;activity:string|null;selectedMonth:string}){
 const monthRows=rows.filter(r=>r.data_programada.startsWith(selectedMonth));
 const defs=[{key:"viga_superior" as const,name:"VIGA SUPERIOR",color:"blue",icon:"▰"},{key:"viga_inferior" as const,name:"VIGA INFERIOR",color:"purple",icon:"▱"},{key:"dobradeira_superior" as const,name:"DOBRADEIRA SUPERIOR",color:"cyan",icon:"▰"},{key:"dobradeira_inferior" as const,name:"DOBRADEIRA INFERIOR",color:"amber",icon:"▱"}];
 const metrics=defs.map(d=>{const planned=monthRows.reduce((s,r)=>s+Number(r.qtd_programada||0),0),done=monthRows.reduce((s,r)=>s+Math.min(Number(r.qtd_programada||0),Number(r[d.key]||0)),0);return {...d,planned,done,pending:Math.max(0,planned-done),percent:planned?Math.min(100,Math.round(done/planned*100)):0};});
 const planned=metrics.reduce((s,m)=>s+m.planned,0),done=metrics.reduce((s,m)=>s+m.done,0),pending=Math.max(0,planned-done),percent=planned?Math.min(100,Math.round(done/planned*100)):0;
 let overduePieces=0,overdueCount=0;
 const byDate=new Map<string,DailyProduction>();
 for(const r of monthRows){
  const qty=Number(r.qtd_programada||0),values=defs.map(d=>Math.min(qty,Number(r[d.key]||0)));
  const rowDone=values.reduce((sum,value)=>sum+value,0),rowPending=values.reduce((sum,value)=>sum+Math.max(0,qty-value),0);
  if(r.data_programada<today&&rowPending>0){overdueCount++;overduePieces+=rowPending;}
  const d=byDate.get(r.data_programada)??{date:r.data_programada,planned:0,done:0,pending:0};
  d.planned+=qty*defs.length;d.done+=rowDone;d.pending+=rowPending;byDate.set(r.data_programada,d);
 }
 const daily=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
 return <><MasterSummary planned={planned} done={done} pending={pending} percent={percent} overduePieces={overduePieces} overdueCount={overdueCount}/>
  <section className="master-sector-cards">{metrics.map(m=><MasterProductionCard key={m.key} name={m.name} planned={m.planned} done={m.done} color={m.color} icon={m.icon}/>)}</section>
  <MasterDailyHistory rows={daily} activity={activity} processName="Ferragem"/>
 </>;
}

const shift=(v:string|null)=>{if(!v)return{label:"Sem apontamento",time:"—",date:"—"};const d=new Date(v),parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Manaus",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d),get=(k:string)=>parts.find(p=>p.type===k)?.value??"",h=Number(get("hour")),m=Number(get("minute")),mins=h*60+m;let label="Fora do turno";if(mins>=420&&mins<=1035)label="1º turno";else if(mins>=1040||mins<=168)label="2º turno";return{label,time:get("hour")+":"+get("minute"),date:get("day")+"/"+get("month")+"/"+get("year")}};
const n=(v:number)=>Number(v||0).toLocaleString("pt-BR");
const date=(v:string)=>{const a=String(v||"").slice(0,10).split("-");return a.length===3?a[2]+"/"+a[1]+"/"+a[0]:"—"};
const finished=(p:Schedule)=>Math.min(...[1,2,3,4].map(id=>p.setores.find(s=>s.subsetor_id===id)?.qtd_apontada??0));
const totals=(rows:Order[]):T=>{const planned=rows.reduce((s,r)=>s+r.programacoes.reduce((a,p)=>a+p.qtd_programada,0),0),done=rows.reduce((s,r)=>s+r.programacoes.reduce((a,p)=>a+finished(p),0),0);return{planned,done,pending:Math.max(0,planned-done),orders:rows.length}};
function Metric({title,t,detail}:{title:string;t:T;detail:string}){const pc=t.planned?Math.min(100,Math.round(t.done/t.planned*100)):0;return <article className="master-metric"><div className="master-metric-head"><span>{title}</span><span className="master-metric-tag">PRODUÇÃO</span></div><div className="master-metric-values"><div><small>Programada</small><strong>{n(t.planned)}</strong></div><div><small>Realizada</small><strong className="master-done">{n(t.done)}</strong></div><div><small>Pendente</small><strong className="master-pending">{n(t.pending)}</strong></div></div><div className="master-metric-track"><span style={{width:pc+"%"}}/></div><div className="master-metric-foot"><span>{pc}% concluído</span><span>{detail}</span></div></article>}
function Chart({items}:{items:{name:string;p:number;d:number}[]}){const max=Math.max(1,...items.map(x=>x.p));return <section className="master-chart-panel"><div className="master-section-heading"><div><span className="master-kicker">COMPARATIVO</span><h2>Programado x realizado</h2><p>Comparação das quantidades no período selecionado</p></div><div className="master-legend"><span><i className="planned-dot"/>Programado</span><span><i className="done-dot"/>Realizado</span></div></div><div className="master-chart">{items.map(x=><div className="master-chart-row" key={x.name}><strong>{x.name}</strong><div className="master-chart-bars"><div className="master-chart-track"><span className="master-chart-planned" style={{width:x.p/max*100+"%"}}/></div><div className="master-chart-track"><span className="master-chart-done" style={{width:x.d/max*100+"%"}}/></div></div><div className="master-chart-numbers"><b>{n(x.p)}</b><b>{n(x.d)}</b></div></div>)}</div></section>}

export default function MasterDashboard(){
 const [daily,setDaily]=useState<DailyDataset|null>(null),[ferr,setFerr]=useState<F[]>([]),[activity,setActivity]=useState<Activity|null>(null),[shiftDaily,setShiftDaily]=useState<ShiftDay[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[selectedMonth,setSelectedMonth]=useState(()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/Manaus"}).slice(0,7)),[view,setView]=useState<View>("estamparia");
 const reload=useCallback(async()=>{setLoading(true);setError("");try{const [d,f,a,s]=await Promise.all([fetchJson<DailyDataset>("/api/ops?dataset=1&fresh=1"),fetchJson<{rows:F[]}>("/api/ferragem"),fetchJson<Activity>("/api/master/activity"),fetchJson<{rows:ShiftDay[]}>("/api/master/estamparia/turnos")]);setDaily(d);setFerr(f.rows??[]);setActivity(a);setShiftDaily(s.rows??[])}catch(e){setError((e as Error).message)}finally{setLoading(false)}},[]);
 useEffect(()=>{void reload()},[reload]);
 useEffect(()=>{const timer=window.setInterval(()=>{void fetchJson<Activity>("/api/master/activity").then(setActivity).catch(()=>{});},60000);return()=>window.clearInterval(timer);},[]);
 const today=daily?.today??new Date().toLocaleDateString("en-CA",{timeZone:"America/Manaus"}),month=today.slice(0,7),match=(v:string)=>String(v).startsWith(selectedMonth);
 const base=daily?.rows??[],est=useMemo(()=>base.filter(r=>!String(r.linha_prod).toUpperCase().startsWith("TRI")&&match(r.data_inicial)),[daily,selectedMonth]),rad=useMemo(()=>base.filter(r=>String(r.linha_prod).toUpperCase().startsWith("TRI")&&match(r.data_inicial)),[daily,selectedMonth]),ff=useMemo(()=>ferr.filter(r=>match(r.data_programada)),[ferr,selectedMonth]);
 const etp=est.reduce((s,r)=>s+r.programacoes.reduce((a,p)=>a+p.qtd_programada*4,0),0),etd=est.reduce((s,r)=>s+r.programacoes.reduce((a,p)=>a+p.setores.reduce((v,x)=>v+Number(x.qtd_apontada||0),0),0),0),et:T={planned:etp,done:etd,pending:Math.max(0,etp-etd),orders:est.length},rp=rad.reduce((s,r)=>s+r.programacoes.reduce((a,p)=>a+(p.radiador_nao_necessario?0:p.qtd_programada),0),0),rd=rad.reduce((s,r)=>s+r.programacoes.reduce((a,p)=>a+(p.radiador_nao_necessario?0:Math.min(p.qtd_programada,p.radiador?.qtd_apontada??0)),0),0),rt:T={planned:rp,done:rd,pending:Math.max(0,rp-rd),orders:rad.length};
 const fp=ff.reduce((s,r)=>s+Number(r.qtd_programada||0)*4,0),fd=ff.reduce((s,r)=>s+Math.min(Number(r.qtd_programada||0),Number(r.viga_superior||0))+Math.min(Number(r.qtd_programada||0),Number(r.viga_inferior||0))+Math.min(Number(r.qtd_programada||0),Number(r.dobradeira_superior||0))+Math.min(Number(r.qtd_programada||0),Number(r.dobradeira_inferior||0)),0),ft:T={planned:fp,done:fd,pending:Math.max(0,fp-fd),orders:ff.length};
 const all={p:et.planned+rt.planned+ft.planned,d:et.done+rt.done+ft.done,pending:et.pending+rt.pending+ft.pending},pct=all.p?Math.min(100,Math.round(all.d/all.p*100)):0;
 const estOverdue=est.flatMap(r=>r.programacoes).filter(p=>p.data_programada<today&&finished(p)<p.qtd_programada);
 const radOverdue=rad.flatMap(r=>r.programacoes).filter(p=>!p.radiador_nao_necessario&&p.data_programada<today&&(p.radiador?.qtd_apontada??0)<p.qtd_programada);
 const ferOverdue=ff.filter(r=>r.data_programada<today&&Math.min(Number(r.qtd_programada||0),Number(r.viga_superior||0),Number(r.viga_inferior||0),Number(r.dobradeira_superior||0),Number(r.dobradeira_inferior||0))<Number(r.qtd_programada||0));
 const overviewOverduePieces=estOverdue.reduce((s,p)=>s+Math.max(0,p.qtd_programada-finished(p)),0)+radOverdue.reduce((s,p)=>s+Math.max(0,p.qtd_programada-(p.radiador?.qtd_apontada??0)),0)+ferOverdue.reduce((s,r)=>s+Math.max(0,Number(r.qtd_programada||0)-Math.min(Number(r.qtd_programada||0),Number(r.viga_superior||0),Number(r.viga_inferior||0),Number(r.dobradeira_superior||0),Number(r.dobradeira_inferior||0))),0);
 const overviewOverdueCount=estOverdue.length+radOverdue.length+ferOverdue.length;
 async function logout(){try{await fetchJson("/api/auth/logout",{method:"POST"});window.location.assign("/login")}catch(e){setError((e as Error).message)}}
 return <main className="master-shell"><header className="master-header"><a href="/master" className="master-brand"><img src="/logo-itam-compact.webp" alt="ITAM Transformadores" width="480" height="216"/><div><h1>MASTER<span>.</span></h1><p>Painel de coordenação da produção</p></div></a><div className="master-header-months"><div className="master-period master-month-picker"><div className="master-month-control"><span className="master-month-caption">MÊS SELECIONADO</span><label className="master-month-input-wrap" htmlFor="master-period"><span className="master-calendar-icon">▦</span><input id="master-period" type="month" value={selectedMonth} onChange={e=>e.target.value&&setSelectedMonth(e.target.value)}/><span className="master-month-chevron">⌄</span></label></div><button type="button" className={selectedMonth===month?"master-month-current active":"master-month-current"} onClick={()=>setSelectedMonth(month)}>▦ <span>Mês Atual</span></button><button type="button" className="master-month-nav" onClick={()=>setSelectedMonth(v=>{const d=new Date(v+"-15T12:00:00");d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,7)})}>‹ <span>Mês Anterior</span></button><button type="button" className="master-month-nav" onClick={()=>setSelectedMonth(v=>{const d=new Date(v+"-15T12:00:00");d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,7)})}><span>Próximo Mês</span> ›</button></div></div><div className="master-actions"><span className="master-readonly">🔒 Somente visualização</span><button className="secondary" onClick={()=>void reload()}>↻ Atualizar</button><button className="secondary" onClick={()=>void logout()}>Sair</button></div></header>
 <div className="master-layout"><nav className="master-side-nav" aria-label="Navegação dos processos"><span className="master-side-label">PAINÉIS</span><button type="button" className={view==="overview"?"active":""} onClick={()=>setView("overview")}><span className="master-nav-icon">▥</span><span>Visão geral</span></button><button type="button" className={view==="estamparia"?"active":""} onClick={()=>setView("estamparia")}><span className="master-nav-icon">▰</span><span>Estamparia</span></button><button type="button" className={view==="radiador"?"active":""} onClick={()=>setView("radiador")}><span className="master-nav-icon">▤</span><span>Radiador</span></button><button type="button" className={view==="ferragem"?"active":""} onClick={()=>setView("ferragem")}><span className="master-nav-icon">⚒</span><span>Ferragem</span></button></nav><div className="master-content"><section className="master-intro"><div><span className="master-kicker">ITAM　›　MASTER - {view==="estamparia"?"ESTAMPARIA":view==="radiador"?"RADIADOR":view==="ferragem"?"FERRAGEM":"PRODUÇÃO"}</span><h2>{view==="estamparia"?<span className="master-estamparia-mark" aria-hidden="true">▥</span>:null}{view==="overview"?"Painel de coordenação":view==="estamparia"?"Estamparia":view==="radiador"?"Radiador":"Ferragem"}</h2><p>{view==="overview"?"Visão consolidada de Estamparia, Radiador e Ferragem.":`Acompanhamento individual de ${view==="estamparia"?"Estamparia":view==="radiador"?"Radiador":"Ferragem"}.`}</p></div></section>
 {error&&<div className="error-inline" role="alert">{error}</div>}{loading&&<div className="master-loading">Carregando dados dos processos...</div>}
 {!loading&&{view==="overview"&&<><MasterSummary planned={all.p} done={all.d} pending={all.pending} percent={pct} overduePieces={overviewOverduePieces} overdueCount={overviewOverdueCount}/>
  <section className="master-sector-cards master-overview-cards">
   <MasterOverviewCard name="ESTAMPARIA" planned={et.planned} done={et.done} color="blue" icon="▰" activity={activity?.estamparia??null}/>
   <MasterOverviewCard name="RADIADOR" planned={rt.planned} done={rt.done} color="cyan" icon="▤" activity={activity?.radiador??null}/>
   <MasterOverviewCard name="FERRAGEM" planned={ft.planned} done={ft.done} color="amber" icon="⚒" activity={activity?.ferragem??null}/>
  </section>
  <Chart items={[{name:"Estamparia",p:et.planned,d:et.done},{name:"Radiador",p:rt.planned,d:rt.done},{name:"Ferragem",p:ft.planned,d:ft.done}]}/>
 </>} {view==="estamparia"&&<><EstampariaSectors rows={est} today={today}/><ShiftDailyChart rows={shiftDaily.filter(x=>x.date.startsWith(selectedMonth))} activity={activity?.estamparia??null}/></>}{view==="radiador"&&<RadiadorMasterPanel rows={rad} today={today} activity={activity?.radiador??null} selectedMonth={selectedMonth}/>}{view==="ferragem"&&<FerragemMasterPanel rows={ff} today={today} activity={activity?.ferragem??null} selectedMonth={selectedMonth}/>}
 </>}
 <footer className="master-footer">ITAM · Painel MASTER <span>Somente consulta · sem permissão para apontamentos</span></footer></div></div></main>;
}