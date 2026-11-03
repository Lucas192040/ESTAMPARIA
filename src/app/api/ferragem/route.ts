import { z } from "zod";
import * as XLSX from "xlsx";
import { requireRole } from "@/lib/auth";
import { answer, failure, guard, limitedBody, ApiError } from "@/lib/server";
import { ferragemDb } from "@/lib/ferragem-server";
export const runtime = "nodejs";
export const maxDuration = 60;
const norm=(v:unknown)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const txt=(v:unknown)=>String(v??"").trim();
function excelDate(v:unknown, date1904=false):string {
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
 for(const name of wb.SheetNames){const rows=XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name],{header:1,defval:null,raw:true});for(let h=0;h<Math.min(rows.length,100);h++){const heads=rows[h].map(norm);const ix=required.map(c=>heads.indexOf(norm(c)));if(ix.every(i=>i>=0)){matches.push({name,rows,header:h,ix});break;}}}
 if(matches.length!==1)throw Error("Não encontrei uma única aba com todas as 20 colunas esperadas da programação de Ferragem.");
 const {name,rows,header,ix}=matches[0];const out:any[]=[];
 for(let i=header+1;i<rows.length;i++){const r=rows[i];if(r.every((v:any)=>v==null||txt(v)===""))continue;try{
 const c=ix.map((j:number)=>r[j]);const op=txt(c[0]),parent=txt(c[1]);if(!op||!parent)throw Error("Nro OP e OP-Pai são obrigatórios.");
 const qty=integer(c[8],"Qtd.Programada",1),si=integer(c[9],"Série Inicial"),sf=integer(c[10],"Série Final");if(sf-si+1!==qty)throw Error("Intervalo de séries não confere com Qtd.Programada.");
 const potencyText=txt(c[15]).replace(/\s*kva\b/i,"").replace(/\s*\(monof[aá]sico\)\s*/i,"").replace(",", ".").trim();const potency=Number(potencyText);if(!potencyText||!Number.isFinite(potency)||potency<0)throw Error("Potência PA inválida.");
 out.push({nro_op:op,op_pai:parent,cod_cli:txt(c[2]),nome_cliente:txt(c[3]),status_op:txt(c[4]),data_programada:excelDate(c[5],!!wb.Workbook?.WBProps?.date1904),atividade:txt(c[6]),descr_atividade:txt(c[7])||"FERRAGEM",qtd_programada:qty,serie_inicial:si,serie_final:sf,dia_semana:txt(c[11]),produto:txt(c[12]),descr_produto:txt(c[13]),referencia_prod:txt(c[14]),potencia_pa:potency,linha_prod:txt(c[16]),qtd_op:integer(c[17],"Qtd.OP"),qtd_op_pai:integer(c[18],"Qtd.OP-Pai"),qtd_apontada_erp:integer(c[19],"Qtd.Apontada")});
 }catch(e){throw Error("Linha "+(i+1)+": "+(e as Error).message);}}
 if(out.length>10000)throw Error("A planilha excede o limite de 10.000 programações.");if(!out.length)throw Error("A planilha não contém programações.");
 return {name,rows:out};
}
export async function GET(req:Request){
 try{await requireRole("ferragem");await guard(req,"read");const q=await ferragemDb().query(`SELECT p.id,p.nro_op,p.op_pai,p.cod_cli,p.nome_cliente,p.status_op,p.data_programada,p.qtd_programada,p.serie_inicial,p.serie_final,p.produto,p.descr_produto,p.referencia_prod,p.potencia_pa,p.linha_prod,p.qtd_op,p.qtd_op_pai,p.qtd_apontada_erp,COALESCE(f.viga_superior,0) viga_superior,COALESCE(f.viga_inferior,0) viga_inferior,COALESCE(f.dobradeira_superior,0) dobradeira_superior,COALESCE(f.dobradeira_inferior,0) dobradeira_inferior FROM public.fer_programacoes p LEFT JOIN public.fer_producao f ON f.programacao_id=p.id ORDER BY p.data_programada,p.op_pai,p.nro_op`);
 return answer({rows:q.rows});}catch(e){return failure(e);}
}
export async function POST(req:Request){
 try{await requireRole("ferragem");await guard(req,"import");const body=await limitedBody(req,4_100_000);const form=await new Response(body,{headers:{"content-type":req.headers.get("content-type")||""}}).formData();const file=form.get("file");if(!(file instanceof File))throw new ApiError("Selecione a planilha de programação.");
 const parsed=parse(Buffer.from(await file.arrayBuffer()),file.name);const client=await ferragemDb().connect();let importId:number;
 try{await client.query("BEGIN");const imp=await client.query("INSERT INTO public.fer_importacoes(nome_arquivo,quantidade_linhas) VALUES($1,$2) RETURNING id",[file.name.slice(0,255),parsed.rows.length]);importId=imp.rows[0].id;
 for(const r of parsed.rows){await client.query(`INSERT INTO public.fer_programacoes(nro_op,op_pai,cod_cli,nome_cliente,status_op,data_programada,atividade,descr_atividade,qtd_programada,serie_inicial,serie_final,dia_semana,produto,descr_produto,referencia_prod,potencia_pa,linha_prod,qtd_op,qtd_op_pai,qtd_apontada_erp,importacao_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
 ON CONFLICT(nro_op,data_programada,serie_inicial,serie_final) DO UPDATE SET op_pai=EXCLUDED.op_pai,cod_cli=EXCLUDED.cod_cli,nome_cliente=EXCLUDED.nome_cliente,status_op=EXCLUDED.status_op,atividade=EXCLUDED.atividade,descr_atividade=EXCLUDED.descr_atividade,qtd_programada=EXCLUDED.qtd_programada,dia_semana=EXCLUDED.dia_semana,produto=EXCLUDED.produto,descr_produto=EXCLUDED.descr_produto,referencia_prod=EXCLUDED.referencia_prod,potencia_pa=EXCLUDED.potencia_pa,linha_prod=EXCLUDED.linha_prod,qtd_op=EXCLUDED.qtd_op,qtd_op_pai=EXCLUDED.qtd_op_pai,qtd_apontada_erp=EXCLUDED.qtd_apontada_erp,importacao_id=EXCLUDED.importacao_id`,
 [r.nro_op,r.op_pai,r.cod_cli,r.nome_cliente,r.status_op,r.data_programada,r.atividade,r.descr_atividade,r.qtd_programada,r.serie_inicial,r.serie_final,r.dia_semana,r.produto,r.descr_produto,r.referencia_prod,r.potencia_pa,r.linha_prod,r.qtd_op,r.qtd_op_pai,r.qtd_apontada_erp,importId]);}
 await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
 return answer({ok:true,linhas:parsed.rows.length,importacao:importId});}catch(e){return failure(e);}
}
export async function PATCH(req:Request){
 try{await requireRole("ferragem");await guard(req,"write");const schema=z.object({programacao_id:z.number().int().positive(),viga_superior:z.number().int().min(0).max(2147483647),viga_inferior:z.number().int().min(0).max(2147483647),dobradeira_superior:z.number().int().min(0).max(2147483647),dobradeira_inferior:z.number().int().min(0).max(2147483647)});const p=schema.parse(JSON.parse((await limitedBody(req,4096)).toString("utf8")));const q=await ferragemDb().query(`INSERT INTO public.fer_producao(programacao_id,viga_superior,viga_inferior,dobradeira_superior,dobradeira_inferior,atualizado_em) SELECT p.id,$2,$3,$4,$5,now() FROM public.fer_programacoes p WHERE p.id=$1 AND $2<=p.qtd_programada AND $3<=p.qtd_programada AND $4<=p.qtd_programada AND $5<=p.qtd_programada ON CONFLICT(programacao_id) DO UPDATE SET viga_superior=EXCLUDED.viga_superior,viga_inferior=EXCLUDED.viga_inferior,dobradeira_superior=EXCLUDED.dobradeira_superior,dobradeira_inferior=EXCLUDED.dobradeira_inferior,atualizado_em=now() RETURNING *`,[p.programacao_id,p.viga_superior,p.viga_inferior,p.dobradeira_superior,p.dobradeira_inferior]);if(!q.rowCount)throw new ApiError("Cada apontamento deve ser menor ou igual à quantidade programada da OP/data.",422);return answer({ok:true,production:q.rows[0]});}catch(e){return failure(e);}
}
