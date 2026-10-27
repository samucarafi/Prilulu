import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import Kit from "@/models/Kit";
import Booking from "@/models/Booking";
import InventoryItem from "@/models/InventoryItem";
import { peakInventoryUsage, type InventoryUsageBooking } from "@/lib/inventory-usage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const kit = typeof body.kitId === "string" ? body.kitId : "";
    const customInventory = Array.isArray(body.customInventory) ? body.customInventory.slice(0, 40).map((part: { itemId?: unknown; quantity?: unknown }) => ({ itemId: String(part.itemId ?? ""), quantity: Number(part.quantity) })) : [];
    const removedInventory: Array<{ itemId: string; quantity: number }> = Array.isArray(body.removedInventory) ? body.removedInventory.slice(0, 40).map((part: { itemId?: unknown; quantity?: unknown }) => ({ itemId: String(part.itemId ?? ""), quantity: Number(part.quantity) })) : [];
    const eventDate = new Date(`${body.date}T12:00:00.000Z`);
    if (!kit || !/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") || Number.isNaN(eventDate.getTime())) {
      return NextResponse.json({ error: "Informe um kit e uma data válidos." }, { status: 400 });
    }
    await connectMongoDB();
    const returnDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
    const product = await Kit.findOne({ slug: kit, active: true }).lean();
    if (!product) return NextResponse.json({ available: false, message: "Kit indisponível." }, { status: 404 });
    if (!product.inventory?.length) return NextResponse.json({ available: false, message: "Este kit ainda não está ligado ao inventário." }, { status: 409 });
    const canEditKit = true;
    if ((customInventory.length || removedInventory.length) && !canEditKit) return NextResponse.json({ available: false, message: "Este kit não permite personalização." }, { status: 400 });
    if (removedInventory.length && product.customizable) return NextResponse.json({ available: false, message: "Este kit não permite retirar peças incluídas." }, { status: 400 });
    if (customInventory.some((part: { itemId: string; quantity: number }) => !part.itemId || !Number.isInteger(part.quantity) || part.quantity < 1) || new Set(customInventory.map((part: { itemId: string }) => part.itemId)).size !== customInventory.length) return NextResponse.json({ available: false, message: "Confira as peças escolhidas." }, { status: 400 });
    if (removedInventory.some((part) => !part.itemId || !Number.isInteger(part.quantity) || part.quantity < 1) || new Set(removedInventory.map((part) => part.itemId)).size !== removedInventory.length) return NextResponse.json({ available: false, message: "Confira as peças a trocar ou retirar." }, { status: 400 });

    // Inventory remains unavailable from the event through the following day's return.
    const activeBookings = await Booking.find({ eventDate: { $lte: returnDate }, status: { $in: ["awaiting_deposit", "confirmed", "picked_up"] } })
      .populate({ path: "kit", select: "inventory" }).lean();
    const used = peakInventoryUsage(activeBookings as unknown as InventoryUsageBooking[], { start: eventDate, end: returnDate });
    const inventoryIds = [...product.inventory.map((part) => String(part.itemId)), ...customInventory.map((part: { itemId: string }) => part.itemId)];
    const inventory = await InventoryItem.find({ _id: { $in: inventoryIds }, available: true }).lean();
    if (inventory.length !== new Set(inventoryIds).size) return NextResponse.json({ available: false, message: "Há itens deste kit sem estoque ativo." }, { status: 409 });
    const removedById = new Map(removedInventory.map((part) => [part.itemId, part.quantity]));
    for (const removed of removedInventory) {
      const basePart = product.inventory.find((part) => String(part.itemId) === removed.itemId);
      const item = inventory.find((entry) => String(entry._id) === removed.itemId);
      if (product.customizable || !basePart || !item || item.category !== "component" || removed.quantity > basePart.quantity) return NextResponse.json({ available: false, message: "Só é possível trocar peças visíveis que já fazem parte deste kit." }, { status: 400 });
    }
    const requestedInventory = new Map<string, number>();
    for (const part of product.inventory) requestedInventory.set(String(part.itemId), (requestedInventory.get(String(part.itemId)) ?? 0) + part.quantity - (removedById.get(String(part.itemId)) ?? 0));
    for (const part of customInventory) {
      const item = inventory.find((entry) => String(entry._id) === part.itemId);
      if (!canEditKit || !item || item.category !== "component") return NextResponse.json({ available: false, message: "Uma das peças escolhidas não pode ser usada neste kit." }, { status: 409 });
      requestedInventory.set(part.itemId, (requestedInventory.get(part.itemId) ?? 0) + part.quantity);
    }
    const structureQuantities = new Map<string, number>();
    for (const part of product.inventory) structureQuantities.set(String(part.itemId), (structureQuantities.get(String(part.itemId)) ?? 0) + part.quantity);
    const allowedCustomIds = (product.customizableItemIds ?? []).map((id) => String(id));
    if (product.customizable && customInventory.length && (!allowedCustomIds.length || customInventory.some((part: { itemId: string }) => !allowedCustomIds.includes(part.itemId)))) return NextResponse.json({ available: false, message: "Uma das peças selecionadas não faz parte das opções deste kit." }, { status: 400 });
    const missingStructure = customInventory.some((part: { itemId: string; quantity: number }) => {
      const item = inventory.find((entry) => String(entry._id) === part.itemId) as (typeof inventory[number] & { requiresStructureId?: unknown }) | undefined;
      return Boolean(item?.requiresStructureId) && (structureQuantities.get(String(item?.requiresStructureId)) ?? 0) < part.quantity;
    });
    if (missingStructure) return NextResponse.json({ available: false, message: "O kit não possui a estrutura necessária para uma das peças escolhidas." }, { status: 409 });
    for (const [itemId, quantity] of requestedInventory) {
      const item = inventory.find((entry) => String(entry._id) === itemId);
      if (!item || item.totalQuantity - (used.get(itemId) ?? 0) < quantity) return NextResponse.json({ available: false, message: "A combinação escolhida excede o estoque disponível para essa data." }, { status: 409 });
    }
    return NextResponse.json({ available: true, message: "Data disponível. O kit fica reservado da festa até a devolução no dia seguinte, após confirmação da loja.", kit: product.name, returnDate: returnDate.toISOString().slice(0, 10) });
  } catch (error) {
    console.error("Falha ao consultar disponibilidade:", error);
    return NextResponse.json({ error: "Não foi possível validar a disponibilidade agora." }, { status: 503 });
  }
}
