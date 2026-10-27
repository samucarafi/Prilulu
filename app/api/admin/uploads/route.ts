import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024;

function imageExtension(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ".png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return null;
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma imagem." }, { status: 400 });
    if (file.size < 1 || file.size > MAX_SIZE) return NextResponse.json({ error: "A imagem deve ter até 5 MB." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = imageExtension(bytes);
    if (!extension) return NextResponse.json({ error: "Use uma imagem PNG, JPG ou WebP válida." }, { status: 415 });
    const directory = path.join(process.cwd(), "public", "uploads");
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    await writeFile(path.join(directory, filename), bytes, { flag: "wx" });
    return NextResponse.json({ image: `/uploads/${filename}` }, { status: 201 });
  } catch (error) {
    console.error("Falha ao salvar imagem:", error);
    return NextResponse.json({ error: "Não foi possível salvar a imagem." }, { status: 500 });
  }
}
