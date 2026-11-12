"use client";
import { useState, type FormEvent } from "react";
import { LockKeyhole, Factory, ArrowRight } from "lucide-react";
import { fetchJson } from "@/lib/client";
export default function LoginScreen() {
  const [role, setRole] = useState<"estamparia" | "radiador" | "ferragem" | "solda" | "pintura" | "master">("estamparia");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await fetchJson<{ destination: string }>("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, password }),
      });
      window.location.assign(result.destination);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return <main className="login-shell">
    <form className="login-panel" onSubmit={login}>
      <img src="/logo-itam-compact.webp" alt="ITAM Transformadores" width={180} height={81} className="login-logo" />
      <div className="login-heading"><Factory size={22}/><h1>Controle de Produção</h1></div>
      <p>Acesse seu setor para realizar os apontamentos e acompanhar a produção.</p>
      <fieldset className="login-sectors"><legend>Setor de acesso</legend>
        <label className={role === "estamparia" ? "active" : ""}><input type="radio" name="role" value="estamparia" checked={role === "estamparia"} onChange={() => { setRole("estamparia"); setPassword(""); setError(""); }} /> Estamparia</label>
        <label className={role === "radiador" ? "active" : ""}><input type="radio" name="role" value="radiador" checked={role === "radiador"} onChange={() => { setRole("radiador"); setPassword(""); setError(""); }} /> Radiador</label>
        <label className={role === "ferragem" ? "active" : ""}><input type="radio" name="role" value="ferragem" checked={role === "ferragem"} onChange={() => { setRole("ferragem"); setPassword(""); setError(""); }} /> Ferragem</label>
        <label className={role === "solda" ? "active" : ""}><input type="radio" name="role" value="solda" checked={role === "solda"} onChange={() => { setRole("solda"); setPassword(""); setError(""); }} /> Solda</label>
        <label className={role === "pintura" ? "active" : ""}><input type="radio" name="role" value="pintura" checked={role === "pintura"} onChange={() => { setRole("pintura"); setPassword(""); setError(""); }} /> Pintura</label>
        <label className={role === "master" ? "active" : ""}><input type="radio" name="role" value="master" checked={role === "master"} onChange={() => { setRole("master"); setPassword(""); setError(""); }} /> MASTER — Visualização geral</label>
      </fieldset>
      <label className="login-password"><span><LockKeyhole size={15}/> Senha do setor</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={256} required placeholder="Digite a senha" />
      </label>
      {error && <div className="error-inline" role="alert">{error}</div>}
      <button type="submit" className="primary login-submit" disabled={busy || !password}>{busy ? "Verificando..." : role === "master" ? "Entrar no MASTER" : "Entrar no setor"}<ArrowRight size={18}/></button>
      <small>{role === "master" ? "Acesso somente para visualizar Estamparia, Radiador, Ferragem, Solda e Pintura." : "O apontamento será permitido exclusivamente no setor autenticado."}</small>
    </form>
  </main>;
}
