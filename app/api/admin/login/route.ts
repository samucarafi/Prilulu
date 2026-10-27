import { NextResponse } from "next/server";
import { adminConfigured, adminCookie, createAdminToken, passwordMatches } from "@/lib/admin-auth";

export async function POST(request: Request) {
  if (!adminConfigured()) return NextResponse.json({ error: "Acesso do proprietário ainda não foi configurado." }, { status: 503 });
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!passwordMatches(password)) return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookie.name, createAdminToken(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: adminCookie.maxAge });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookie.name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
