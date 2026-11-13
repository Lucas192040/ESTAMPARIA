"use client";
import { useState, type FormEvent } from "react";
import { LockKeyhole, Factory, ArrowRight, Gauge, Wrench, Flame, Paintbrush, ShieldCheck, Activity } from "lucide-react";
import { fetchJson } from "@/lib/client";

type AccessRole = "estamparia" | "radiador" | "ferragem" | "solda" | "pintura" | "master";

const sectorCards: Array<{
  role: AccessRole;
  title: string;
  description: string;
  className: string;
  image?: string;
  Icon: typeof Factory;
}> = [
  {
    role: "estamparia",
    title: "ESTAMPARIA",
    description: "Corte a Laser CALFRAN",
    className: "estamparia",
    image: "https://braffemam.com.br/wp-content/webp-express/webp-images/uploads/2025/01/Maquina-de-corte-a-laser.png.webp",
    Icon: Factory,
  },
  {
    role: "radiador",
    title: "RADIADOR",
    description: "Radiador de Transformador",
    className: "radiador",
    image: "https://image.made-in-china.com/2f0j00WlTqkFcDbRgy/Customized-Gilled-Transformer-Radiator-for-Oil-Immersed-Power-Transformer.jpg",
    Icon: Gauge,
  },
  {
    role: "ferragem",
    title: "FERRAGEM",
    description: "Corte Plasma UNIPLASMA",
    className: "ferragem",
    image: "https://www.hypertherm.com/globalassets/images/industries/metal-fabrication/plasma-cutting.jpg",
    Icon: Wrench,
  },
  {
    role: "solda",
    title: "SOLDA TANQUE",
    description: "Soldagem de Tanques",
    className: "solda",
    image: "https://www.mitm.com/images/2022/tank-welding.webp",
    Icon: Flame,
  },
  {
    role: "pintura",
    title: "PINTURA",
    description: "Transformador ITAM TOP",
    className: "pintura",
    image: "https://genbatrafo.com.tr/wp-content/uploads/2025/02/Trafo-Kazani-Boya-Yenilemesi-scaled.jpg",
    Icon: Paintbrush,
  },
];

export default function LoginScreen() {
  const [role, setRole] = useState<AccessRole>("estamparia");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await fetchJson<{ destination: string }>("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, password }),
      });
      window.location.assign(result.destination);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function chooseRole(nextRole: AccessRole) {
    setRole(nextRole);
    setPassword("");
    setError("");
  }

  return (
    <main className="access-shell">
      <header className="access-hero">
        <div className="access-brand">
          <img src="/logo-itam-compact.webp" alt="ITAM Gestão Industrial" />
        </div>
        <div className="access-heading">
          <h1>Central de Acessos</h1>
          <p>Selecione o processo que deseja acompanhar</p>
        </div>
        <div className="access-online"><Activity size={18} /><span>SISTEMA ONLINE</span></div>
      </header>

      <form className="access-content" onSubmit={login}>
        <fieldset className="access-grid">
          <legend className="sr-only">Selecione o processo</legend>
          {sectorCards.map(({ role: cardRole, title, description, className, image, Icon }) => (
            <label
              key={cardRole}
              className={`access-card ${className} ${role === cardRole ? "active" : ""} ${cardRole === "pintura" ? "wide" : ""}`}
              style={image ? { backgroundImage: `linear-gradient(90deg, rgba(3,10,22,.04) 0%, rgba(3,10,22,.22) 38%, rgba(3,10,22,.94) 70%), url("${image}")` } : undefined}
            >
              <input
                type="radio"
                name="role"
                value={cardRole}
                checked={role === cardRole}
                onChange={() => chooseRole(cardRole)}
              />
              <span className="access-card-content">
                <Icon className="access-card-icon" size={48} strokeWidth={1.7} />
                <strong>{title}</strong>
                <small>{description}</small>
                <span className="access-card-action">ACESSAR SETOR <ArrowRight size={22} /></span>
              </span>
            </label>
          ))}
        </fieldset>

        <section className="access-auth">
          <div className="access-auth-title">
            <LockKeyhole size={18} />
            <span>ACESSO SEGURO</span>
            <i />
            <small>{role === "master" ? "Painel de coordenação" : `Setor selecionado: ${sectorCards.find((item) => item.role === role)?.title}`}</small>
          </div>
          <div className="access-auth-row">
            <label className="login-password">
              <span>Senha do setor</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={256}
                required
                placeholder="Digite a senha para continuar"
              />
            </label>
            <button type="submit" className="access-submit" disabled={busy || !password}>
              {busy ? "VERIFICANDO..." : role === "master" ? "ENTRAR NO MASTER" : "ENTRAR NO SETOR"}
              <ArrowRight size={19} />
            </button>
          </div>
          {error && <div className="error-inline" role="alert">{error}</div>}
        </section>

        <button type="button" className={`access-master-link ${role === "master" ? "selected" : ""}`} onClick={() => chooseRole("master")}>
          <ShieldCheck size={17} /> Acesso MASTER <span>Visão geral dos processos</span>
        </button>
      </form>

      <footer className="access-footer">
        <span>ITAM</span><i /> CONTROLE E ACOMPANHAMENTO INDUSTRIAL
      </footer>
    </main>
  );
}
