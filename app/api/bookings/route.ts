import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import Kit from "@/models/Kit";
import InventoryItem from "@/models/InventoryItem";
import Booking from "@/models/Booking";
import Coupon from "@/models/Coupon";
import { peakInventoryUsage, type InventoryUsageBooking } from "@/lib/inventory-usage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const name = String(input.name ?? "").trim().slice(0, 100);
    const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
    const phone = String(input.phone ?? "").trim().slice(0, 40);
    const slug = String(input.kitId ?? "").trim().slice(0, 100);
    const extras = Array.isArray(input.extras) ? [...new Set(input.extras.filter((id: unknown) => typeof id === "string"))].slice(0, 20) as string[] : [];
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "") ? new Date(`${input.date}T12:00:00.000Z`) : null;
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || phone.length < 8 || !eventDate || !slug) {
      return NextResponse.json({ error: "Preencha nome, e-mail, telefone e data da festa." }, { status: 400 });
    }
    await connectMongoDB();
    const returnDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
    const kit = await Kit.findOne({ slug, active: true }).lean();
    if (!kit || !kit.inventory.length) return NextResponse.json({ error: "Este kit não está disponível para reserva." }, { status: 409 });
    const items = await InventoryItem.find({ _id: { $in: [...kit.inventory.map((part) => part.itemId), ...extras] }, available: true }).lean();
    const itemById = new Map(items.map((item) => [String(item._id), item]));
    if (items.length !== new Set([...kit.inventory.map((part) => String(part.itemId)), ...extras]).size) {
      return NextResponse.json({ error: "Um ou mais itens não estão mais disponíveis." }, { status: 409 });
    }
    const activeBookings = await Booking.find({ eventDate: { $lte: returnDate }, status: { $in: ["awaiting_deposit", "confirmed", "picked_up"] } }).populate({ path: "kit", select: "inventory" }).lean();
    const used = peakInventoryUsage(activeBookings as unknown as InventoryUsageBooking[], { start: eventDate, end: returnDate });
    for (const part of kit.inventory) {
      const item = itemById.get(String(part.itemId));
      if (!item || item.totalQuantity - (used.get(String(part.itemId)) ?? 0) < part.quantity) return NextResponse.json({ error: "O estoque desse kit acabou de ficar indisponível para a data escolhida." }, { status: 409 });
    }
    for (const id of extras) {
      const item = itemById.get(id);
      if (!item || item.category !== "extra" || item.totalQuantity - (used.get(id) ?? 0) < 1) return NextResponse.json({ error: "Um adicional escolhido não está disponível para a data." }, { status: 409 });
    }
    const subtotalCents = kit.priceCents + extras.reduce((sum, id) => sum + (itemById.get(id)?.priceCents ?? 0), 0);
    const couponCode = typeof input.coupon === "string" ? input.coupon.trim().toUpperCase() : "";
    let coupon = null;
    let totalCents = subtotalCents;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode, active: true }).lean();
      const now = Date.now();
      if (!coupon || (coupon.startsAt && coupon.startsAt.getTime() > now) || (coupon.expiresAt && coupon.expiresAt.getTime() < now) || (coupon.maxUses && coupon.uses >= coupon.maxUses) || subtotalCents < coupon.minimumCents) return NextResponse.json({ error: "O cupom não é válido para este pedido." }, { status: 400 });
      const discount = coupon.discountPercent ? Math.floor(subtotalCents * coupon.discountPercent / 100) : Math.min(subtotalCents, coupon.discountCents ?? 0);
      totalCents = subtotalCents - discount;
    }
    const [booking] = await Booking.create([{ customerName: name, email, phone, eventDate, returnDate, kit: kit._id, extras: extras.map((item) => ({ item, quantity: 1 })), coupon: coupon?._id, totalCents, depositCents: Math.ceil(totalCents / 2), status: "awaiting_contact" }]);
    if (coupon) {
      const usageFilter = { _id: coupon._id, active: true, ...(coupon.maxUses ? { uses: { $lt: coupon.maxUses } } : {}) };
      const updatedCoupon = await Coupon.findOneAndUpdate(usageFilter, { $inc: { uses: 1 } });
      if (!updatedCoupon) { await Booking.findByIdAndUpdate(booking._id, { status: "cancelled" }); return NextResponse.json({ error: "O cupom atingiu o limite de usos. Remova-o e envie novamente." }, { status: 409 }); }
    }
    return NextResponse.json({ ok: true, bookingId: String(booking._id), totalCents, depositCents: Math.ceil(totalCents / 2), returnDate: returnDate.toISOString().slice(0, 10), message: "Pedido recebido. A devolução fica prevista para o dia seguinte à festa; a loja confirma ou ajusta a data e a disponibilidade antes de combinar o sinal." }, { status: 201 });
  } catch (error) {
    console.error("Falha ao criar solicitação de reserva:", error);
    return NextResponse.json({ error: "Não foi possível enviar o pedido agora. Tente novamente mais tarde." }, { status: 503 });
  }
}
