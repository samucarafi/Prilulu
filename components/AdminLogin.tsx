"use client";

import { useState } from "react";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return <main className="admin-login"><form onSubmit={async (e) => { e.preventDefault(); setLoading(true); setError(""); const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); const result = await response.json(); if (response.ok) location.reload(); else setError(result.error ?? "Não foi possível entrar."); setLoading(false); }}><div className="eyebrow">ÁREA DA LOJA <span>✳</span></div><h1>Bem-vinda à<br/><em>Prilulu.</em></h1><p>Entre com a senha de proprietária para acessar o estoque e os pedidos.</p><label>Senha de acesso<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></label>{error&&<div className="admin-error">{error}</div>}<button className="button button-pink button-full" disabled={loading}>{loading?"Entrando…":"Entrar no painel"}</button></form></main>;
}
