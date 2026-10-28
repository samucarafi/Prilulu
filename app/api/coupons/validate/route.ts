import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import Coupon from "@/models/Coupon";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = String(body.code ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const subtotal = Number(body.subtotalCents);
    if (!code || !Number.isInteger(subtotal) || subtotal < 0) {
      return NextResponse.json({ error: "Informe um cupom e um valor válidos." }, { status: 400 });
    }
    await connectMongoDB();
    const now = new Date();
    const coupon = await Coupon.findOne({
      code, active: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
      ],
    }).lean();
    if (!coupon || (coupon.maxUses && coupon.uses >= coupon.maxUses)) {
      return NextResponse.json({ error: "Cupom inválido ou expirado." }, { status: 404 });
    }
    if (subtotal < coupon.minimumCents) {
      return NextResponse.json({ error: "O valor do pedido não atinge o mínimo deste cupom." }, { status: 400 });
    }
    const discountCents = coupon.discountPercent
      ? Math.floor(subtotal * coupon.discountPercent / 100)
      : Math.min(subtotal, coupon.discountCents ?? 0);
    const totalCents = subtotal - discountCents;
    if (totalCents < 8000) {
      return NextResponse.json({
        error: "Este desconto deixaria o pedido abaixo do valor mínimo de R$ 80,00. Escolha outro cupom ou acrescente itens.",
      }, { status: 400 });
    }
    return NextResponse.json({ valid: true, code: coupon.code, discountCents, totalCents });
  } catch (error) {
    console.error("Falha ao validar cupom:", error);
    return NextResponse.json({ error: "Não foi possível validar o cupom agora." }, { status: 503 });
  }
}
