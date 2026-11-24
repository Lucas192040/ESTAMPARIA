import { z } from "zod";
import * as XLSX from "xlsx";
import { requireRole } from "@/lib/auth";
import { answer, failure, guard, limitedBody, ApiError } from "@/lib/server";
import { soldaDb } from "@/lib/solda-server";
export const runtime="nodejs"; export const maxDuration=60;
const norm=(v:unknown)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const txt=(v:unknown)=>String(v??"").trim();
function date(v:unknown,date1904=false):string {
 let y:number,m:number,d:number;
 if(typeof v==="number"){const p=XLSX.SSF.parse_date_code(v,{date1904});if(!p)throw Error("Data programada inválida.");({y,m,d}=p);}
 else {const s=txt(v);let a=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(a){d=+a[1];m=+a[2];y=+a[3];}else{a=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(!a)throw Error("Data inválida: "+s);y=+a[1];m=+a[2];d=+a[3];}}
 const dt=new Date(Date.UTC(y,m-1,d));if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw Error("Data programada inválida.");
 return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function integer(v:unknown,label:string,min=0){const s=txt(v).replace(/\./g,"").replace(",",".");const n=Number(s);if(!Number.isSafeInteger(n)||n<min||n>2147483647)throw Error(label+" inválido.");return n;}
function parse(buffer:Buffer,filename:string){
 if(!/\.xlsx?$/i.test(filename)||buffer.length>4_000_000)throw Error("Selecione Excel .xls/.xlsx de até 4 MB.");
 const wb=XLSX.read(buffer,{type:"buffer",cellDates:false,sheetRows:10002});
 const required=["Nro OP","OP-Pai","Cód.Cli","Nome Cliente","Status OP","Dt.Programada","Atividade","Descr.Atividade","Qtd.Programada","Série Inicial","Série Final","Dia Semana","Produto","Descr.Produto","Referência Prod.","Potência PA","Linha Prod","Qtd.OP","Qtd.OP-Pai","Qtd.Apontada"];
 const matches:any[]=[];
 for(const name of wb.SheetNames){const rows=XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name],{header:1,defval:null,raw:true});for(let h=0;h<Math.min(rows.length,100);h++){const heads=rows[h].map(norm),ix=required.map(c=>heads.indexOf(norm(c)));if(ix.every(i=>i>=0)){matches.push({name,rows,header:h,ix});break;}}}
 if(matches.length!==1)throw Error("Não encontrei uma única aba com as 20 colunas esperadas da planilha.");
 const {rows,header,ix}=matches[0],out:any[]=[];let ignoradas=0;
 for(let i=header+1;i<rows.length;i++){const r=rows[i];if(r.every((v:any)=>v==null||txt(v)===""))continue;const c=ix.map((j:number)=>r[j]);const produto=txt(c[13]).toUpperCase();if(!produto.startsWith("TANQUE")){ignoradas++;continue;}
 try{const op=txt(c[0]),parent=txt(c[1]);if(!op||!parent)throw Error("Nro OP e OP-Pai são obrigatórios.");const qty=integer(c[8],"Qtd.Programada",1),si=integer(c[9],"Série Inicial"),sf=integer(c[10],"Série Final");if(sf-si+1!==qty)throw Error("Intervalo de séries não confere com Qtd.Programada.");
 const potRaw=txt(c[15]);const potMatch=potRaw.match(/^[+-]?\d+(?:[.,]\d+)?/);const pot=potRaw===""?0:potMatch?Number(potMatch[0].replace(",", ".")):NaN;if(!Number.isFinite(pot)||pot<0)throw Error("Potência PA inválida.");
 out.push({nro_op:op,op_pai:parent,cod_cli:txt(c[2]),nome_cliente:txt(c[3]),status_op:txt(c[4]),data_programada:date(c[5],!!wb.Workbook?.WBProps?.date1904),atividade:txt(c[6]),descr_atividade:txt(c[7])||"SOLDA TANQUE",qtd_programada:qty,serie_inicial:si,serie_final:sf,dia_semana:txt(c[11]),produto:txt(c[12]),descr_produto:txt(c[13]),referencia_prod:txt(c[14]),potencia_pa:pot,linha_prod:txt(c[16]),qtd_op:integer(c[17],"Qtd.OP"),qtd_op_pai:integer(c[18],"Qtd.OP-Pai"),qtd_apontada_erp:integer(c[19],"Qtd.Apontada")});}
 catch(e){throw Error("Linha "+(i+1)+": "+(e as Error).message);}}
 if(!out.length)throw Error("A planilha não contém linhas válidas de TANQUE.");
 if(out.length>10000)throw Error("A planilha excede 10.000 programações.");
 return {rows:out,ignoradas};
}
export async function GET(req:Request){try{const role=await requireRole();if(role!=="solda"&&role!=="master")throw new ApiError("Acesso restrito à Solda.",403);await guard(req,"read");const q=await soldaDb().query(`SELECT p.id,p.nro_op,p.op_pai,p.nome_cliente,p.status_op,p.data_programada,p.qtd_programada,p.serie_inicial,p.serie_final,p.produto,p.descr_produto,p.referencia_prod,p.potencia_pa,p.linha_prod,COALESCE(s.tanque,0) tanque,s.atualizado_em FROM public.solda_programacoes p LEFT JOIN public.solda_producao s ON s.programacao_id=p.id ORDER BY p.data_programada,p.op_pai,p.nro_op`);return answer({rows:q.rows});}catch(e){return failure(e);}}
export async function POST(req:Request){try{await requireRole("solda");await guard(req,"import");const body=await limitedBody(req,4_100_000);const form=await new Response(body,{headers:{"content-type":req.headers.get("content-type")||""}}).formData();const file=form.get("file");if(!(file instanceof File))throw new ApiError("Selecione a planilha de Solda.");const parsed=parse(Buffer.from(await file.arrayBuffer()),file.name),client=await soldaDb().connect();let id:number,stage="iniciar transação";try{await client.query("BEGIN");stage="registrar importação";const imp=await client.query("INSERT INTO public.solda_importacoes(nome_arquivo,quantidade_linhas) VALUES($1::text,$2::integer) RETURNING id",[file.name.slice(0,255),parsed.rows.length]);id=imp.rows[0].id;const stableKey=(r:any)=>JSON.stringify([r.nro_op,r.op_pai,r.produto,r.referencia_prod]);
const incomingCounts=new Map<string,number>();
for(const r of parsed.rows){const k=stableKey(r);incomingCounts.set(k,(incomingCounts.get(k)||0)+1);}
for(const r of parsed.rows){
 const values=[r.nro_op,r.op_pai,r.cod_cli,r.nome_cliente,r.status_op,r.data_programada,r.atividade,r.descr_atividade,r.qtd_programada,r.serie_inicial,r.serie_final,r.dia_semana,r.produto,r.descr_produto,r.referencia_prod,r.potencia_pa,r.linha_prod,r.qtd_op,r.qtd_op_pai,r.qtd_apontada_erp,id];
 stage="localizar programação exata";const exact=await client.query("SELECT id FROM public.solda_programacoes WHERE nro_op=$1::varchar AND data_programada=$2::date AND serie_inicial=$3::integer AND serie_final=$4::integer FOR UPDATE",[r.nro_op,r.data_programada,r.serie_inicial,r.serie_final]);
 if(exact.rowCount){
  stage="atualizar programação exata";await client.query(`UPDATE public.solda_programacoes SET op_pai=$1::varchar,cod_cli=$2::varchar,nome_cliente=$3::text,status_op=$4::text,data_programada=$5::date,atividade=$6::text,descr_atividade=$7::text,qtd_programada=$8::integer,serie_inicial=$9::integer,serie_final=$10::integer,dia_semana=$11::text,produto=$12::text,descr_produto=$13::text,referencia_prod=$14::text,potencia_pa=$15::numeric,linha_prod=$16::text,qtd_op=$17::integer,qtd_op_pai=$18::integer,qtd_apontada_erp=$19::integer,importacao_id=$20::bigint WHERE id=$21::bigint`,[r.op_pai,r.cod_cli,r.nome_cliente,r.status_op,r.data_programada,r.atividade,r.descr_atividade,r.qtd_programada,r.serie_inicial,r.serie_final,r.dia_semana,r.produto,r.descr_produto,r.referencia_prod,r.potencia_pa,r.linha_prod,r.qtd_op,r.qtd_op_pai,r.qtd_apontada_erp,id,exact.rows[0].id]);
  continue;
 }
 stage="localizar programação para atualização";const candidates=incomingCounts.get(stableKey(r))===1?await client.query("SELECT id FROM public.solda_programacoes WHERE nro_op=$1::varchar AND op_pai=$2::varchar AND produto=$3::text AND referencia_prod=$4::text FOR UPDATE",[r.nro_op,r.op_pai,r.produto,r.referencia_prod]):{rows:[],rowCount:0};
 if(candidates.rowCount===1){
  stage="atualizar programação existente";await client.query(`UPDATE public.solda_programacoes SET nro_op=$2::varchar,op_pai=$3::varchar,cod_cli=$4::varchar,nome_cliente=$5::text,status_op=$6::text,data_programada=$7::date,atividade=$8::text,descr_atividade=$9::text,qtd_programada=$10::integer,serie_inicial=$11::integer,serie_final=$12::integer,dia_semana=$13::text,produto=$14::text,descr_produto=$15::text,referencia_prod=$16::text,potencia_pa=$17::numeric,linha_prod=$18::text,qtd_op=$19::integer,qtd_op_pai=$20::integer,qtd_apontada_erp=$21::integer,importacao_id=$22::bigint WHERE id=$1::bigint`,[candidates.rows[0].id,...values]);
  continue;
 }
 stage="inserir nova programação";await client.query(`INSERT INTO public.solda_programacoes(nro_op,op_pai,cod_cli,nome_cliente,status_op,data_programada,atividade,descr_atividade,qtd_programada,serie_inicial,serie_final,dia_semana,produto,descr_produto,referencia_prod,potencia_pa,linha_prod,qtd_op,qtd_op_pai,qtd_apontada_erp,importacao_id) VALUES($1::varchar,$2::varchar,$3::varchar,$4::text,$5::text,$6::date,$7::text,$8::text,$9::integer,$10::integer,$11::integer,$12::text,$13::text,$14::text,$15::text,$16::numeric,$17::text,$18::integer,$19::integer,$20::integer,$21::bigint)`,values);
};await client.query("COMMIT");}catch(e){console.error("Falha na importação Solda",{stage,code:(e as any)?.code,message:(e as Error).message});await client.query("ROLLBACK");throw e;}finally{client.release();}return answer({ok:true,linhas:parsed.rows.length,ignoradas:parsed.ignoradas,importacao:id});}catch(e){return failure(e);}}
export async function PATCH(req:Request){
 try{
  await requireRole("solda");
  await guard(req,"write");
  const raw=JSON.parse((await limitedBody(req,2048)).toString("utf8"));
  const programacaoId=String(raw?.programacao_id??"").trim();
  const tanque=typeof raw?.tanque==="number"?raw.tanque:Number(String(raw?.tanque??"").trim());
  if(!programacaoId||programacaoId.length>100)throw new ApiError("Selecione uma programação válida.",422);
  if(!Number.isSafeInteger(tanque)||tanque<0||tanque>2147483647)throw new ApiError("Informe uma quantidade inteira válida.",422);
  const client=await soldaDb().connect();
  try{
   await client.query("BEGIN");
   const q=await client.query(`INSERT INTO public.solda_producao(programacao_id,tanque,atualizado_em)
    SELECT p.id,$2,now() FROM public.solda_programacoes p
    WHERE p.id::text=$1 AND $2<=p.qtd_programada
    ON CONFLICT(programacao_id) DO UPDATE SET tanque=EXCLUDED.tanque,atualizado_em=now()
    RETURNING *`,[programacaoId,tanque]);
   if(!q.rowCount)throw new ApiError("A programação não foi encontrada ou a quantidade supera o total programado.",422);
   await client.query("INSERT INTO public.solda_apontamentos_historico(programacao_id,tanque) VALUES($1,$2)",[q.rows[0].programacao_id,tanque]);
   await client.query("COMMIT");
   return answer({ok:true,production:q.rows[0]});
  }catch(e){await client.query("ROLLBACK");throw e;}
  finally{client.release();}
 }catch(e){return failure(e);}
}
