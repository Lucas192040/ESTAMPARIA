import { requireRole } from "@/lib/auth";
import { answer, failure, guard } from "@/lib/server";
import { db } from "@/lib/server";
export const runtime = "nodejs";

type EventRow={programacao_id:number;subsetor_id:number;efetivo_novo:number;registrado_em:string};
type Bucket={date:string;first:number;second:number;total:number};

export async function GET(req:Request){
 try{
  await requireRole("master"); await guard(req,"read");
  const result=await db().query<EventRow>(`
   SELECT COALESCE(a.programacao_id,p.id) AS programacao_id,a.subsetor_id,a.efetivo_novo,a.registrado_em
   FROM public.est_apontamentos a
   LEFT JOIN LATERAL (SELECT id FROM public.est_programacoes p WHERE p.op_id=a.op_id AND p.data_programada=a.data_programada_original ORDER BY p.id LIMIT 1) p ON a.programacao_id IS NULL
   WHERE COALESCE(a.programacao_id,p.id) IS NOT NULL AND a.efetivo_novo IS NOT NULL
   ORDER BY a.registrado_em ASC,a.id ASC
  `);
  const byMoment=new Map<string,EventRow[]>();
  for(const row of result.rows){
   const key=String(row.registrado_em)+"|"+String(row.programacao_id);
   const group=byMoment.get(key)??[];group.push(row);byMoment.set(key,group);
  }
  const state=new Map<number,Map<number,number>>();
  const days=new Map<string,Bucket>();
  for(const [key,events] of byMoment){
   const schedule=Number(events[0].programacao_id);
   const sectors=state.get(schedule)??new Map<number,number>();
   const before=sectors.size>=4?Math.min(...[1,2,3,4].map(id=>sectors.get(id)??0)):0;
   for(const event of events)sectors.set(Number(event.subsetor_id),Number(event.efetivo_novo));
   state.set(schedule,sectors);
   const after=sectors.size>=4?Math.min(...[1,2,3,4].map(id=>sectors.get(id)??0)):0;
   const delta=after-before;
   if(delta===0)continue;
   const instant=new Date(events[0].registrado_em);
   const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Manaus",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(instant);
   const get=(name:string)=>parts.find(p=>p.type===name)?.value??"";
   const hour=Number(get("hour")),minute=Number(get("minute")),mins=hour*60+minute;
   let day=get("year")+"-"+get("month")+"-"+get("day"),turn:"first"|"second"|null=null;
   if(mins>=420&&mins<=1035)turn="first";
   else if(mins>=1040){turn="second";}
   else if(mins<=168){turn="second";const prev=new Date(Date.UTC(Number(get("year")),Number(get("month"))-1,Number(get("day"))-1));day=prev.toISOString().slice(0,10);}
   if(!turn)continue;
   const bucket=days.get(day)??{date:day,first:0,second:0,total:0};
   bucket[turn]+=delta;bucket.total+=delta;days.set(day,bucket);
  }
  const rows=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
  return answer({rows,timezone:"America/Manaus",source:"completed_delta",excluded_legacy:result.rows.filter(r=>!r.programacao_id).length});
 }catch(error){return failure(error);}
}
