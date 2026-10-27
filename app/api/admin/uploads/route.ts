import { NextResponse } from "next/server";
import { getCloudinaryConfig, signCloudinaryParams } from "@/lib/cloudinary";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function hasImageSignature(bytes: Buffer, type: string) {
  if (type === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma imagem." }, { status: 400 });
    if (file.size < 1 || file.size > MAX_SIZE) return NextResponse.json({ error: "A imagem deve ter até 5 MB." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Use uma imagem PNG, JPG ou WebP." }, { status: 415 });
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!hasImageSignature(bytes, file.type)) return NextResponse.json({ error: "O conteúdo do arquivo não corresponde a uma imagem válida." }, { status: 415 });
    const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const params = {
      allowed_formats: "jpg,jpeg,png,webp",
      folder: "prilulu-festas/catalogo",
      timestamp,
      transformation: "c_limit,h_1400,w_1400,q_auto,f_auto",
    };
    const uploadForm = new FormData();
    const imageBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(imageBuffer).set(bytes);
    uploadForm.set("file", new Blob([imageBuffer], { type: file.type }), file.name);
    uploadForm.set("api_key", apiKey);
    for (const [key, value] of Object.entries(params)) uploadForm.set(key, value);
    uploadForm.set("signature", signCloudinaryParams(params, apiSecret));
    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, { method: "POST", body: uploadForm });
    const result = await uploadResponse.json();
    if (!uploadResponse.ok || typeof result.secure_url !== "string" || typeof result.public_id !== "string") {
      console.error("Resposta de upload do Cloudinary:", result);
      return NextResponse.json({ error: "O Cloudinary não conseguiu processar esta imagem." }, { status: 502 });
    }
    return NextResponse.json({ image: result.secure_url, publicId: result.public_id }, { status: 201 });
  } catch (error) {
    console.error("Falha ao enviar imagem ao Cloudinary:", error);
    const message = error instanceof Error && error.message.startsWith("Configure CLOUDINARY_")
      ? error.message
      : "Não foi possível enviar a imagem ao Cloudinary.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
