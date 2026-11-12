import { z } from "zod";
import * as XLSX from "xlsx";
import { requireRole } from "@/lib/auth";
import { answer, failure, guard, limitedBody, ApiError } from "@/lib/server";
import { db } from "@/lib/server";
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
 out.push({nro_op:op,op_pai:parent,cod_cli:txt(c[2]),nome_cliente:txt(c[3]),status_op:txt(c[4]),data_programada:date(c[5],!!wb.Workbook?.WBProps?.date1904),atividade:txt(c[6]),descr_atividade:txt(c[7])||"PINTURA TANQUE/TAMPA",qtd_programada:qty,serie_inicial:si,serie_final:sf,dia_semana:txt(c[11]),produto:txt(c[12]),descr_produto:txt(c[13]),referencia_prod:txt(c[14]),potencia_pa:pot,linha_prod:txt(c[16]),qtd_op:integer(c[17],"Qtd.OP"),qtd_op_pai:integer(c[18],"Qtd.OP-Pai"),qtd_apontada_erp:integer(c[19],"Qtd.Apontada")});}
 catch(e){throw Error("Linha "+(i+1)+": "+(e as Error).message);}}
 if(!out.length)throw Error("A planilha não contém linhas válidas de TANQUE.");
 if(out.length>10000)throw Error("A planilha excede 10.000 programações.");
 return {rows:out,ignoradas};
}
export async function GET(req:Request){try{const role=await requireRole();if(role!=="pintura"&&role!=="master")throw new ApiError("Acesso restrito à Pintura.",403);await guard(req,"read");const q=await db().query(`SELECT p.id,p.nro_op,p.op_pai,p.nome_cliente,p.status_op,p.data_programada,p.qtd_programada,p.serie_inicial,p.serie_final,p.produto,p.descr_produto,p.referencia_prod,p.potencia_pa,p.linha_prod,COALESCE(s.tanque,0) tanque,s.atualizado_em FROM public.pintura_programacoes p LEFT JOIN public.pintura_producao s ON s.programacao_id=p.id ORDER BY p.data_programada,p.op_pai,p.nro_op`);return answer({rows:q.rows});}catch(e){return failure(e);}}
export async function POST(req:Request){try{await requireRole("pintura");await guard(req,"import");const body=await limitedBody(req,4_100_000);const form=await new Response(body,{headers:{"content-type":req.headers.get("content-type")||""}}).formData();const file=form.get("file");if(!(file instanceof File))throw new ApiError("Selecione a planilha de Pintura.");const parsed=parse(Buffer.from(await file.arrayBuffer()),file.name),client=await db().connect();let id:number;try{await client.query("BEGIN");const imp=await client.query("INSERT INTO public.pintura_importacoes(nome_arquivo,quantidade_linhas) VALUES($1,$2) RETURNING id",[file.name.slice(0,255),parsed.rows.length]);id=imp.rows[0].id;const stableKey=(r:any)=>JSON.stringify([r.nro_op,r.op_pai,r.produto,r.referencia_prod]);
const incomingCounts=new Map<string,number>();
for(const r of parsed.rows){const k=stableKey(r);incomingCounts.set(k,(incomingCounts.get(k)||0)+1);}
for(const r of parsed.rows){
 const values=[r.nro_op,r.op_pai,r.cod_cli,r.nome_cliente,r.status_op,r.data_programada,r.atividade,r.descr_atividade,r.qtd_programada,r.serie_inicial,r.serie_final,r.dia_semana,r.produto,r.descr_produto,r.referencia_prod,r.potencia_pa,r.linha_prod,r.qtd_op,r.qtd_op_pai,r.qtd_apontada_erp,id];
 const exact=await client.query("SELECT id FROM public.pintura_programacoes WHERE nro_op=$1 AND data_programada=$2 AND serie_inicial=$3 AND serie_final=$4 FOR UPDATE",[r.nro_op,r.data_programada,r.serie_inicial,r.serie_final]);
 if(exact.rowCount){
  await client.query(`UPDATE public.pintura_programacoes SET op_pai=$2,cod_cli=$3,nome_cliente=$4,status_op=$5,data_programada=$6,atividade=$7,descr_atividade=$8,qtd_programada=$9,serie_inicial=$10,serie_final=$11,dia_semana=$12,produto=$13,descr_produto=$14,referencia_prod=$15,potencia_pa=$16,linha_prod=$17,qtd_op=$18,qtd_op_pai=$19,qtd_apontada_erp=$20,importacao_id=$21 WHERE id=$22`,[r.op_pai,r.cod_cli,r.nome_cliente,r.status_op,r.data_programada,r.atividade,r.descr_atividade,r.qtd_programada,r.serie_inicial,r.serie_final,r.dia_semana,r.produto,r.descr_produto,r.referencia_prod,r.potencia_pa,r.linha_prod,r.qtd_op,r.qtd_op_pai,r.qtd_apontada_erp,id,exact.rows[0].id]);
  continue;
 }
 const candidates=incomingCounts.get(stableKey(r))===1?await client.query("SELECT id FROM public.pintura_programacoes WHERE nro_op=$1 AND op_pai=$2 AND produto=$3 AND referencia_prod=$4 FOR UPDATE",[r.nro_op,r.op_pai,r.produto,r.referencia_prod]):{rows:[],rowCount:0};
 if(candidates.rowCount===1){
  await client.query(`UPDATE public.pintura_programacoes SET nro_op=$2,op_pai=$3,cod_cli=$4,nome_cliente=$5,status_op=$6,data_programada=$7,atividade=$8,descr_atividade=$9,qtd_programada=$10,serie_inicial=$11,serie_final=$12,dia_semana=$13,produto=$14,descr_produto=$15,referencia_prod=$16,potencia_pa=$17,linha_prod=$18,qtd_op=$19,qtd_op_pai=$20,qtd_apontada_erp=$21,importacao_id=$22 WHERE id=$1`,[candidates.rows[0].id,...values]);
  continue;
 }
 await client.query(`INSERT INTO public.pintura_programacoes(nro_op,op_pai,cod_cli,nome_cliente,status_op,data_programada,atividade,descr_atividade,qtd_programada,serie_inicial,serie_final,dia_semana,produto,descr_produto,referencia_prod,potencia_pa,linha_prod,qtd_op,qtd_op_pai,qtd_apontada_erp,importacao_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,values);
};await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}return answer({ok:true,linhas:parsed.rows.length,ignoradas:parsed.ignoradas,importacao:id});}catch(e){return failure(e);}}
export async function PATCH(req:Request){
 try{
  await requireRole("pintura");
  await guard(req,"write");
  const raw=JSON.parse((await limitedBody(req,2048)).toString("utf8"));
  const programacaoId=String(raw?.programacao_id??"").trim();
  const tanque=typeof raw?.tanque==="number"?raw.tanque:Number(String(raw?.tanque??"").trim());
  if(!programacaoId||programacaoId.length>100)throw new ApiError("Selecione uma programação válida.",422);
  if(!Number.isSafeInteger(tanque)||tanque<0||tanque>2147483647)throw new ApiError("Informe uma quantidade inteira válida.",422);
  const client=await db().connect();
  try{
   await client.query("BEGIN");
   const q=await client.query(`INSERT INTO public.pintura_producao(programacao_id,tanque,atualizado_em)
    SELECT p.id,$2,now() FROM public.pintura_programacoes p
    WHERE p.id::text=$1 AND $2<=p.qtd_programada
    ON CONFLICT(programacao_id) DO UPDATE SET tanque=EXCLUDED.tanque,atualizado_em=now()
    RETURNING *`,[programacaoId,tanque]);
   if(!q.rowCount)throw new ApiError("A programação não foi encontrada ou a quantidade supera o total programado.",422);
   await client.query("INSERT INTO public.pintura_apontamentos_historico(programacao_id,tanque) VALUES($1,$2)",[q.rows[0].programacao_id,tanque]);
   await client.query("COMMIT");
   return answer({ok:true,production:q.rows[0]});
  }catch(e){await client.query("ROLLBACK");throw e;}
  finally{client.release();}
 }catch(e){return failure(e);}
}
