import { requireRole } from "@/lib/auth";
import { answer, failure, guard } from "@/lib/server";
import { db } from "@/lib/server";
import { ferragemDb } from "@/lib/ferragem-server";
export const runtime = "nodejs";

type Event = { programacao_id:number; registrado_em:string; [key:string]:any };
type Bucket = { date:string; first:number; second:number; total:number };
function add(map:Map<string,Bucket>, instant:string, delta:number) {
 if(delta<=0)return;
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Manaus",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant));
 const get=(k:string)=>parts.find(p=>p.type===k)?.value??"";
 const hour=Number(get("hour")),minute=Number(get("minute")),mins=hour*60+minute;
 let day=get("year")+"-"+get("month")+"-"+get("day"),turn:"first"|"second"|null=null;
 if(mins>=420&&mins<=1035)turn="first";
 else if(mins>=1040)turn="second";
 else if(mins<=168){turn="second";const d=new Date(Date.UTC(Number(get("year")),Number(get("month"))-1,Number(get("day"))-1));day=d.toISOString().slice(0,10);}
 if(!turn)return;
 const b=map.get(day)??{date:day,first:0,second:0,total:0};b[turn]+=delta;b.total+=delta;map.set(day,b);
}
function rows(map:Map<string,Bucket>){return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));}
export async function GET(req:Request){
 try{
  await requireRole("master");await guard(req,"read");
  const [rad,fer]=await Promise.all([
   db().query<Event>(`
    SELECT COALESCE(a.programacao_id,p.id) AS programacao_id,a.efetivo_novo,a.registrado_em,a.id
    FROM public.rad_apontamentos a
    LEFT JOIN LATERAL (SELECT id FROM public.est_programacoes p WHERE p.op_id=a.op_id AND p.data_programada=a.data_programada_original ORDER BY p.id LIMIT 1) p ON a.programacao_id IS NULL
    WHERE COALESCE(a.programacao_id,p.id) IS NOT NULL
    ORDER BY a.registrado_em ASC,a.id ASC
   `),
   ferragemDb().query<Event>(`
    SELECT programacao_id,viga_superior,viga_inferior,dobradeira_superior,dobradeira_inferior,registrado_em,id
    FROM public.fer_apontamentos_historico ORDER BY registrado_em ASC,id ASC
   `)
  ]);
  const radState=new Map<number,number>(),radDays=new Map<string,Bucket>();
  for(const e of rad.rows){const id=Number(e.programacao_id),before=radState.get(id)??0,after=Number(e.efetivo_novo??0);radState.set(id,after);add(radDays,e.registrado_em,Math.max(0,after-before));}
  const ferState=new Map<number,Record<string,number>>(),ferDays=new Map<string,Bucket>();
  const fields=["viga_superior","viga_inferior","dobradeira_superior","dobradeira_inferior"];
  for(const e of fer.rows){const id=Number(e.programacao_id),before=ferState.get(id)??{viga_superior:0,viga_inferior:0,dobradeira_superior:0,dobradeira_inferior:0};let delta=0;const next:Record<string,number>={...before};for(const field of fields){const value=Number(e[field]??0);delta+=Math.max(0,value-(before[field]??0));next[field]=value;}ferState.set(id,next);add(ferDays,e.registrado_em,delta);}
  return answer({radiador:rows(radDays),ferragem:rows(ferDays),timezone:"America/Manaus"});
 }catch(error){return failure(error);}
}
