"use client";
import { useState, type FormEvent } from "react";
import { LockKeyhole, Factory, ArrowRight } from "lucide-react";
import { fetchJson } from "@/lib/client";
export default function LoginScreen() {
  const [role, setRole] = useState<"estamparia" | "radiador">("estamparia");
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
      </fieldset>
      <label className="login-password"><span><LockKeyhole size={15}/> Senha do setor</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={256} required placeholder="Digite a senha" />
      </label>
      {error && <div className="error-inline" role="alert">{error}</div>}
      <button type="submit" className="primary login-submit" disabled={busy || !password}>{busy ? "Verificando..." : "Entrar no setor"}<ArrowRight size={18}/></button>
      <small>O apontamento será permitido exclusivamente no setor autenticado.</small>
    </form>
  </main>;
}
