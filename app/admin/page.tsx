import Link from "next/link";
import { adminConfigured, isAdminAuthenticated } from "@/lib/admin-auth";
import AdminLogin from "@/components/AdminLogin";
import AdminWorkspace from "@/components/AdminWorkspace";
import "./admin.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!adminConfigured()) return <main className="admin-login"><section><div className="eyebrow">CONFIGURAÇÃO DO PAINEL</div><h1>Proteja sua<br/><em>loja.</em></h1><p>Adicione <code>ADMIN_PASSWORD</code> e <code>ADMIN_SESSION_SECRET</code> ao arquivo <code>.env.local</code> e reinicie o servidor para ativar o acesso proprietário.</p><Link href="/" className="admin-back">Voltar à vitrine</Link></section></main>;
  if (!(await isAdminAuthenticated())) return <AdminLogin />;
  return <AdminWorkspace />;
}
