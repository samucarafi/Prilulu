import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { connectMongoDB } from "@/lib/mongodb";
import Kit from "@/models/Kit";
import InventoryItem from "@/models/InventoryItem";
import Booking from "@/models/Booking";
import Coupon from "@/models/Coupon";
import { peakInventoryUsage, peakOptionUsage, type InventoryUsageBooking } from "@/lib/inventory-usage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const name = String(input.name ?? "").trim().slice(0, 100);
    const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
    const phone = String(input.phone ?? "").trim().slice(0, 40);
    const whatsappUpdatesOptIn = true;
    const slug = String(input.kitId ?? "").trim().slice(0, 100);
    const customInventory = Array.isArray(input.customInventory) ? input.customInventory.slice(0, 40).map((part: { itemId?: unknown; quantity?: unknown }) => ({ itemId: String(part.itemId ?? ""), quantity: Number(part.quantity) })) : [];
    const removedInventory: Array<{ itemId: string; quantity: number }> = Array.isArray(input.removedInventory) ? input.removedInventory.slice(0, 40).map((part: { itemId?: unknown; quantity?: unknown }) => ({ itemId: String(part.itemId ?? ""), quantity: Number(part.quantity) })) : [];
    if (customInventory.some((part: { itemId: string; quantity: number }) => !part.itemId || !Number.isInteger(part.quantity) || part.quantity < 1) || new Set(customInventory.map((part: { itemId: string }) => part.itemId)).size !== customInventory.length) return NextResponse.json({ error: "Confira as peças e quantidades do kit personalizado." }, { status: 400 });
    if (removedInventory.some((part) => !part.itemId || !Number.isInteger(part.quantity) || part.quantity < 1) || new Set(removedInventory.map((part) => part.itemId)).size !== removedInventory.length) return NextResponse.json({ error: "Confira as peças que deseja trocar ou retirar." }, { status: 400 });
    const requestedExtras: Array<{ id: string; options: Record<string, string> }> = [];
    if (Array.isArray(input.extras)) for (const entry of input.extras.slice(0, 20) as unknown[]) {
      if (typeof entry === "string") requestedExtras.push({ id: entry, options: {} });
      else if (entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string") {
        const rawOptions = (entry as { options?: unknown }).options;
        const options: Record<string, string> = {};
        if (rawOptions && typeof rawOptions === "object") for (const [groupId, optionId] of Object.entries(rawOptions)) if (typeof optionId === "string") options[groupId] = optionId;
        requestedExtras.push({ id: (entry as { id: string }).id, options });
      }
    }
    if (new Set(requestedExtras.map((entry) => entry.id)).size !== requestedExtras.length) return NextResponse.json({ error: "Escolha cada adicional apenas uma vez." }, { status: 400 });
    const extras = requestedExtras.map((entry) => entry.id);
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "") ? new Date(`${input.date}T12:00:00.000Z`) : null;
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || phone.length < 8 || !eventDate || !slug) {
      return NextResponse.json({ error: "Preencha nome, e-mail, telefone e data da festa." }, { status: 400 });
    }
    await connectMongoDB();
    const returnDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
    const kit = await Kit.findOne({ slug, active: true }).lean();
    if (!kit || !kit.inventory.length) return NextResponse.json({ error: "Este kit não está disponível para reserva." }, { status: 409 });
    const canEditKit = true;
    if ((customInventory.length || removedInventory.length) && !canEditKit) return NextResponse.json({ error: "Este kit não permite personalização." }, { status: 400 });
    if (removedInventory.length && kit.customizable) return NextResponse.json({ error: "Este kit não permite retirar peças incluídas." }, { status: 400 });
    if (kit.customizable && !customInventory.length) return NextResponse.json({ error: "Escolha ao menos uma peça para montar seu kit." }, { status: 400 });
    const itemIds = [...kit.inventory.map((part) => String(part.itemId)), ...customInventory.map((part: { itemId: string }) => part.itemId), ...extras];
    const items = await InventoryItem.find({ _id: { $in: itemIds }, available: true }).lean() as unknown as Array<{ _id: unknown; category: string; name: string; totalQuantity: number; priceCents: number; customPriceCents?: number; requiresStructureId?: unknown; family?: string; color?: string; size?: string; image?: string; optionGroups?: Array<{ id: string; name: string; required: boolean; options: Array<{ id: string; name: string; image?: string; priceDeltaCents: number; stockQuantity: number | null }> }> }>;
    const itemById = new Map(items.map((item) => [String(item._id), item]));
    if (items.length !== new Set(itemIds).size) {
      return NextResponse.json({ error: "Um ou mais itens não estão mais disponíveis." }, { status: 409 });
    }
    const lockIds = [...new Set(itemIds)].sort();
    const lockToken = randomUUID();
    const lockedIds: string[] = [];
    try {
    const now = new Date();
    for (const itemId of lockIds) {
      const locked = await InventoryItem.findOneAndUpdate({ _id: itemId, $or: [{ reservationLockUntil: { $exists: false } }, { reservationLockUntil: null }, { reservationLockUntil: { $lt: now } }] }, { $set: { reservationLockToken: lockToken, reservationLockUntil: new Date(now.getTime() + 120_000) } }, { new: true }).select("_id").lean();
      if (!locked) return NextResponse.json({ error: "Estamos validando outra reserva para uma destas peças. Aguarde um instante e tente novamente." }, { status: 409 });
      lockedIds.push(itemId);
    }
    const activeBookings = await Booking.find({ eventDate: { $lte: returnDate }, status: { $in: ["awaiting_deposit", "confirmed", "picked_up"] } }).populate({ path: "kit", select: "inventory" }).lean();
    const used = peakInventoryUsage(activeBookings as unknown as InventoryUsageBooking[], { start: eventDate, end: returnDate });
    const usedOptions = peakOptionUsage(activeBookings as unknown as InventoryUsageBooking[], { start: eventDate, end: returnDate });
    const removedById = new Map(removedInventory.map((part) => [part.itemId, part.quantity]));
    for (const removed of removedInventory) {
      const basePart = kit.inventory.find((part) => String(part.itemId) === removed.itemId);
      const baseItem = itemById.get(removed.itemId);
      if (kit.customizable || !basePart || !baseItem || baseItem.category !== "component" || removed.quantity > basePart.quantity) return NextResponse.json({ error: "Só é possível trocar peças visíveis que já fazem parte deste kit." }, { status: 400 });
    }
    const requestedInventory = new Map<string, number>();
    for (const part of kit.inventory) requestedInventory.set(String(part.itemId), (requestedInventory.get(String(part.itemId)) ?? 0) + part.quantity - (removedById.get(String(part.itemId)) ?? 0));
    let customPartsCents = 0;
    const baseStructureQuantities = new Map<string, number>();
    for (const part of kit.inventory) baseStructureQuantities.set(String(part.itemId), (baseStructureQuantities.get(String(part.itemId)) ?? 0) + part.quantity);
    const allowedCustomIds = (kit.customizableItemIds ?? []).map((id) => String(id));
    for (const part of customInventory) {
      const item = itemById.get(part.itemId);
      if (!canEditKit || !item || item.category !== "component") return NextResponse.json({ error: "Uma peça escolhida não está disponível para a data selecionada." }, { status: 409 });
      if (kit.customizable && (!allowedCustomIds.length || !allowedCustomIds.includes(part.itemId))) return NextResponse.json({ error: `A peça “${item.name}” não faz parte das opções permitidas para este kit.` }, { status: 400 });
      if (item.requiresStructureId && (baseStructureQuantities.get(String(item.requiresStructureId)) ?? 0) < part.quantity) return NextResponse.json({ error: `A estrutura necessária para “${item.name}” não está incluída neste kit.` }, { status: 409 });
      customPartsCents += (item.customPriceCents ?? 0) * part.quantity;
      requestedInventory.set(part.itemId, (requestedInventory.get(part.itemId) ?? 0) + part.quantity);
    }
    for (const [itemId, quantity] of requestedInventory) {
      const item = itemById.get(itemId);
      if (!item || item.totalQuantity - (used.get(itemId) ?? 0) < quantity) return NextResponse.json({ error: "A combinação escolhida excede o estoque disponível para essa data." }, { status: 409 });
    }
    const pricedExtras: Array<{ item: string; quantity: number; unitPriceCents: number; selectedOptions: Array<{ groupId: string; groupName: string; optionId: string; optionName: string; image: string; priceDeltaCents: number }> }> = [];
    let extrasSubtotalCents = 0;
    for (const requested of requestedExtras) {
      const id = requested.id;
      const item = itemById.get(id);
      if (!item || item.category !== "extra" || item.totalQuantity - (used.get(id) ?? 0) < 1) return NextResponse.json({ error: "Um adicional escolhido não está disponível para a data." }, { status: 409 });
      const groups = item.optionGroups ?? [];
      const validGroupIds = new Set(groups.map((group) => group.id));
      if (Object.keys(requested.options).some((groupId) => !validGroupIds.has(groupId))) return NextResponse.json({ error: "Uma opção de adicional não existe mais. Atualize a página e tente novamente." }, { status: 409 });
      const selectedOptions: Array<{ groupId: string; groupName: string; optionId: string; optionName: string; image: string; priceDeltaCents: number }> = [];
      for (const group of groups) {
        const optionId = requested.options[group.id];
        if (!optionId && group.required) return NextResponse.json({ error: `Escolha uma opção para “${group.name}”.` }, { status: 400 });
        if (!optionId) continue;
        const option = group.options.find((candidate) => candidate.id === optionId);
        if (!option) return NextResponse.json({ error: `A opção escolhida para “${group.name}” não está disponível.` }, { status: 409 });
        if (option.stockQuantity !== null && (usedOptions.get(`${id}:${group.id}:${option.id}`) ?? 0) >= option.stockQuantity) return NextResponse.json({ error: `A opção “${option.name}” do adicional ${item.name} acabou de ficar indisponível para essa data.` }, { status: 409 });
        selectedOptions.push({ groupId: group.id, groupName: group.name, optionId: option.id, optionName: option.name, image: option.image ?? "", priceDeltaCents: option.priceDeltaCents ?? 0 });
      }
      const optionDeltaCents = selectedOptions.reduce((sum, option) => sum + option.priceDeltaCents, 0);
      if (item.priceCents + optionDeltaCents < 0) return NextResponse.json({ error: `As opções do adicional ${item.name} resultam em um valor inválido.` }, { status: 400 });
      extrasSubtotalCents += optionDeltaCents;
      pricedExtras.push({ item: id, quantity: 1, unitPriceCents: item.priceCents, selectedOptions });
    }
    const subtotalCents = (kit.customizable ? (kit.customBasePriceCents ?? kit.priceCents) : kit.priceCents) + customPartsCents + extras.reduce((sum, id) => sum + (itemById.get(id)?.priceCents ?? 0), 0) + extrasSubtotalCents;
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
    const customInventorySnapshot = canEditKit ? customInventory.map((part: { itemId: string; quantity: number }) => {
      const item = itemById.get(part.itemId)!;
      return { itemId: part.itemId, name: item.name, family: (item as { family?: string }).family ?? "", color: (item as { color?: string }).color ?? "", size: (item as { size?: string }).size ?? "", image: (item as { image?: string }).image ?? "", unitPriceCents: item.customPriceCents ?? 0, quantity: part.quantity };
    }) : [];
    const [booking] = await Booking.create([{ customerName: name, email, phone, whatsappUpdatesOptIn, eventDate, returnDate, kit: kit._id, customInventory: customInventorySnapshot, removedInventory: removedInventory.map((part) => ({ itemId: part.itemId, quantity: part.quantity })), extras: pricedExtras, coupon: coupon?._id, totalCents, depositCents: Math.ceil(totalCents / 2), status: "awaiting_contact" }]);
    if (coupon) {
      const usageFilter = { _id: coupon._id, active: true, ...(coupon.maxUses ? { uses: { $lt: coupon.maxUses } } : {}) };
      const updatedCoupon = await Coupon.findOneAndUpdate(usageFilter, { $inc: { uses: 1 } });
      if (!updatedCoupon) { await Booking.findByIdAndUpdate(booking._id, { status: "cancelled" }); return NextResponse.json({ error: "O cupom atingiu o limite de usos. Remova-o e envie novamente." }, { status: 409 }); }
    }
    return NextResponse.json({ ok: true, bookingId: String(booking._id), totalCents, depositCents: Math.ceil(totalCents / 2), returnDate: returnDate.toISOString().slice(0, 10), message: "Pedido recebido. A devolução fica prevista para o dia seguinte à festa; a loja confirma ou ajusta a data e a disponibilidade antes de combinar o sinal." }, { status: 201 });
    } finally {
      if (lockedIds.length) await InventoryItem.updateMany({ _id: { $in: lockedIds }, reservationLockToken: lockToken }, { $unset: { reservationLockToken: 1, reservationLockUntil: 1 } });
    }
  } catch (error) {
    console.error("Falha ao criar solicitação de reserva:", error);
    return NextResponse.json({ error: "Não foi possível enviar o pedido agora. Tente novamente mais tarde." }, { status: 503 });
  }
}
