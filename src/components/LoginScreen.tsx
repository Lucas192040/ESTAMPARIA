"use client";
import { useState, type FormEvent } from "react";
import { LockKeyhole, Factory, ArrowRight, Gauge, Wrench, Flame, Paintbrush, ShieldCheck, Activity, X } from "lucide-react";
import { fetchJson } from "@/lib/client";

type AccessRole = "estamparia" | "radiador" | "ferragem" | "solda" | "pintura" | "master";
const sectorCards = [
 { role:"estamparia" as const,title:"ESTAMPARIA",description:"Corte a Laser CALFRAN",className:"estamparia",image:"https://braffemam.com.br/wp-content/webp-express/webp-images/uploads/2025/01/Maquina-de-corte-a-laser.png.webp",Icon:Factory },
 { role:"radiador" as const,title:"RADIADOR",description:"Radiador de Transformador",className:"radiador",image:"https://image.made-in-china.com/2f0j00WlTqkFcDbRgy/Customized-Gilled-Transformer-Radiator-for-Oil-Immersed-Power-Transformer.jpg",Icon:Gauge },
 { role:"ferragem" as const,title:"FERRAGEM",description:"Corte Plasma UNIPLASMA",className:"ferragem",image:"https://www.hypertherm.com/globalassets/images/industries/metal-fabrication/plasma-cutting.jpg",Icon:Wrench },
 { role:"solda" as const,title:"SOLDA TANQUE",description:"Soldagem de Tanques",className:"solda",image:"https://www.mitm.com/images/2022/tank-welding.webp",Icon:Flame },
 { role:"pintura" as const,title:"PINTURA",description:"Transformador ITAM TOP",className:"pintura",image:"https://genbatrafo.com.tr/wp-content/uploads/2025/02/Trafo-Kazani-Boya-Yenilemesi-scaled.jpg",Icon:Paintbrush },
];
export default function LoginScreen(){
 const [role,setRole]=useState<AccessRole>("estamparia"),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[showAuth,setShowAuth]=useState(false);
 async function login(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError("");try{const result=await fetchJson<{destination:string}>("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({role,password})});window.location.assign(result.destination)}catch(err){setError((err as Error).message);setBusy(false)}}
 function openSector(next:AccessRole){setRole(next);setPassword("");setError("");setShowAuth(true)}
 return <main className="access-shell">
  <header className="access-hero"><div className="access-brand"><img src="/logo-itam-compact.webp" alt="ITAM Gestão Industrial"/></div><div className="access-heading"><h1>Central de Acessos</h1><p>Selecione o processo que deseja acompanhar</p></div><div className="access-online"><Activity size={18}/><span>SISTEMA ONLINE</span></div></header>
  <section className="access-content" aria-label="Processos industriais"><div className="access-grid">
   {sectorCards.map(({role:cardRole,title,description,className,image,Icon})=><button type="button" key={cardRole} className={`access-card ${className} ${cardRole==="pintura"?"wide":""}`} onClick={()=>openSector(cardRole)} aria-label={`Acessar ${title}`}><span className="access-card-photo" style={{backgroundImage:`url("${image}")`}}/><span className="access-card-angle"/><span className="access-card-content"><Icon className="access-card-icon" size={54} strokeWidth={1.8}/><strong>{title}</strong><small>{description}</small><span className="access-card-action">ACESSAR SETOR <span className="access-arrow"><ArrowRight size={29}/></span></span></span></button>)}
  </div></section>
  <footer className="access-footer"><i className="access-footer-line"/><span>ITAM&nbsp; • &nbsp;CONTROLE E ACOMPANHAMENTO INDUSTRIAL</span><i className="access-footer-line"/><button type="button" className="access-master-link" onClick={()=>openSector("master")}><ShieldCheck size={15}/> MASTER</button></footer>
  {showAuth&&<div className="access-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAuth(false)}}><form className="access-auth" onSubmit={login} role="dialog" aria-modal="true" aria-labelledby="access-auth-heading"><button type="button" className="access-modal-close" onClick={()=>setShowAuth(false)} aria-label="Fechar"><X size={20}/></button><div className="access-auth-title" id="access-auth-heading"><LockKeyhole size={20}/><span>{role==="master"?"ACESSO MASTER":`ACESSO • ${sectorCards.find(x=>x.role===role)?.title}`}</span></div><label className="login-password"><span>Senha de acesso</span><input type="password" autoComplete="current-password" autoFocus value={password} onChange={e=>setPassword(e.target.value)} maxLength={256} required placeholder="Digite sua senha"/></label><button type="submit" className="access-submit" disabled={busy||!password}>{busy?"VERIFICANDO...":"ENTRAR"} <ArrowRight size={19}/></button>{error&&<div className="error-inline" role="alert">{error}</div>}</form></div>}
 </main>
}
