"use client";
import { useState, type FormEvent } from "react";
import { LockKeyhole, Factory, ArrowRight, Gauge, Wrench, Flame, Paintbrush, ShieldCheck } from "lucide-react";
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
    description: "Corte a laser • Máquina CALFRAN",
    className: "estamparia",
    image: "https://braffemam.com.br/wp-content/webp-express/webp-images/uploads/2025/01/Maquina-de-corte-a-laser.png.webp",
    Icon: Factory,
  },
  {
    role: "radiador",
    title: "RADIADOR",
    description: "Radiadores de transformadores",
    className: "radiador",
    image: "https://image.made-in-china.com/2f0j00WlTqkFcDbRgy/Customized-Gilled-Transformer-Radiator-for-Oil-Immersed-Power-Transformer.jpg",
    Icon: Gauge,
  },
  {
    role: "ferragem",
    title: "FERRAGEM",
    description: "Corte plasma • UNIPLASMA",
    className: "ferragem",
    image: "https://cdn.prod.website-files.com/5f85d2a8170cc25cfcd113d6/5fd79c8ff6de3b742ccbc6a7_laser%20%281%29.svg",
    Icon: Wrench,
  },
  {
    role: "solda",
    title: "SOLDA TANQUE",
    description: "Soldagem de tanques",
    className: "solda",
    image: "https://www.mitm.com/images/2022/tank-welding.webp",
    Icon: Flame,
  },
  {
    role: "pintura",
    title: "PINTURA",
    description: "Pintura de transformadores • ITAM TOP",
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
    <main className="login-shell">
      <form className="login-panel" onSubmit={login}>
        <img src="/logo-itam-compact.webp" alt="ITAM Transformadores" width={180} height={81} className="login-logo" />
        <div className="login-heading"><Factory size={22} /><h1>Controle de Produção</h1></div>
        <p>Selecione o setor para acessar os apontamentos e acompanhar a produção.</p>
        <fieldset className="login-sectors">
          <legend>Selecione o processo</legend>
          {sectorCards.map(({ role: cardRole, title, description, className, image, Icon }) => (
            <label
              key={cardRole}
              className={`sector-tile ${className} ${role === cardRole ? "active" : ""}`}
              style={image ? { backgroundImage: `linear-gradient(90deg, rgba(4,13,24,.08), rgba(4,13,24,.35) 35%, rgba(4,13,24,.96) 72%), url("${image}")` } : undefined}
            >
              <input
                type="radio"
                name="role"
                value={cardRole}
                checked={role === cardRole}
                onChange={() => chooseRole(cardRole)}
              />
              <span className="sector-tile-content">
                <Icon className="sector-tile-icon" size={30} strokeWidth={1.9} />
                <strong>{title}</strong>
                <small>{description}</small>
                <span className="sector-tile-action">ACESSAR SETOR <ArrowRight size={15} /></span>
              </span>
            </label>
          ))}
          <label className={`sector-tile master ${role === "master" ? "active" : ""}`}>
            <input
              type="radio"
              name="role"
              value="master"
              checked={role === "master"}
              onChange={() => chooseRole("master")}
            />
            <span className="sector-tile-content">
              <ShieldCheck className="sector-tile-icon" size={30} strokeWidth={1.9} />
              <strong>PAINEL MASTER</strong>
              <small>Visão geral de todos os setores • Acesso restrito à coordenação</small>
              <span className="sector-tile-action">ACESSAR MASTER <ArrowRight size={15} /></span>
            </span>
          </label>
        </fieldset>
        <label className="login-password">
          <span><LockKeyhole size={15} /> Senha do setor</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={256}
            required
            placeholder="Digite a senha"
          />
        </label>
        {error && <div className="error-inline" role="alert">{error}</div>}
        <button type="submit" className="primary login-submit" disabled={busy || !password}>
          {busy ? "Verificando..." : role === "master" ? "Entrar no MASTER" : "Entrar no setor"}
          <ArrowRight size={18} />
        </button>
        <small>{role === "master" ? "Acesso somente para visualizar os setores de produção." : "O apontamento será permitido exclusivamente no setor autenticado."}</small>
      </form>
    </main>
  );
}
