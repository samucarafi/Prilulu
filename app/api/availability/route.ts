import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import Kit from "@/models/Kit";
import Booking from "@/models/Booking";
import InventoryItem from "@/models/InventoryItem";
import { peakInventoryUsage, type InventoryUsageBooking } from "@/lib/inventory-usage";

export const dynamic = "force-dynamic";
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const kitId = typeof body.kitId === "string" ? body.kitId : "";
    const customInventory = Array.isArray(body.customInventory)
      ? body.customInventory.slice(0, 40).map((part: { itemId?: unknown; quantity?: unknown }) => ({
          itemId: String(part.itemId ?? ""), quantity: Number(part.quantity),
        }))
      : [];
    const removedInventory = Array.isArray(body.removedInventory)
      ? body.removedInventory.slice(0, 40).map((part: { itemId?: unknown; quantity?: unknown }) => ({
          itemId: String(part.itemId ?? ""), quantity: Number(part.quantity),
        }))
      : [];
    const dateText = String(body.date ?? "");
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? new Date(`${dateText}T12:00:00.000Z`) : null;
    if (!kitId || !eventDate || Number.isNaN(eventDate.getTime())) {
      return NextResponse.json({ error: "Informe um kit e uma data válidos." }, { status: 400 });
    }
    if (customInventory.some((part) => !part.itemId || !Number.isInteger(part.quantity) || part.quantity < 1) ||
        new Set(customInventory.map((part) => part.itemId)).size !== customInventory.length) {
      return NextResponse.json({ available: false, message: "Confira as peças escolhidas." }, { status: 400 });
    }
    if (removedInventory.some((part) => !part.itemId || !Number.isInteger(part.quantity) || part.quantity < 1) ||
        new Set(removedInventory.map((part) => part.itemId)).size !== removedInventory.length) {
      return NextResponse.json({ available: false, message: "Confira as peças a retirar." }, { status: 400 });
    }

    await connectMongoDB();
    if (kitId === "__montar_do_zero__") {
      return NextResponse.json({ available: false, message: "Selecione um dos kits prontos da vitrine." }, { status: 400 });
    }
    const product = await Kit.findOne({ slug: kitId, active: true }).lean();
    if (!product || !product.inventory?.length) {
      return NextResponse.json({ available: false, message: "Kit indisponível ou ainda sem inventário." }, { status: 409 });
    }

    const baseInventory = product?.inventory ?? [];
    const baseIds = baseInventory.map((part) => String(part.itemId));
    const selectedIds = customInventory.map((part) => part.itemId);
    const itemIds = [...new Set([...baseIds, ...selectedIds])];
    const items = await InventoryItem.find({ _id: { $in: itemIds }, available: true }).lean() as unknown as Array<{
      _id: unknown; name: string; category: string; totalQuantity: number; requiresStructureId?: unknown;
    }>;
    if (items.length !== itemIds.length) {
      return NextResponse.json({ available: false, message: "Há peças do kit sem estoque ativo." }, { status: 409 });
    }
    const byId = new Map(items.map((item) => [String(item._id), item]));
    const structureIds = [...new Set(items.flatMap((item) =>
      item.category === "component" && item.requiresStructureId
        ? [String(item.requiresStructureId)]
        : [],
    ))];
    const structures = structureIds.length
      ? await InventoryItem.find({ _id: { $in: structureIds }, category: "structure", available: true }).lean() as unknown as typeof items
      : [];
    if (structures.length !== structureIds.length) {
      return NextResponse.json({ available: false, message: "Uma estrutura necessária não está ativa no inventário." }, { status: 409 });
    }
    for (const part of customInventory) {
      const item = byId.get(part.itemId);
      if (!item || item.category !== "component") {
        return NextResponse.json({ available: false, message: "Uma das peças escolhidas não pode ser usada." }, { status: 400 });
      }
    }

    const returnDate = new Date(eventDate.getTime() + DAY_MS);
    const activeBookings = await Booking.find({
      eventDate: { $lte: returnDate },
      returnDate: { $gte: eventDate },
      status: { $in: ["awaiting_contact", "awaiting_contact", "awaiting_deposit", "confirmed", "picked_up"] },
    }).populate({ path: "kit", select: "inventory" }).lean();
    const used = peakInventoryUsage(activeBookings as unknown as InventoryUsageBooking[], { start: eventDate, end: returnDate });

    const removedById = new Map(removedInventory.map((part) => [part.itemId, part.quantity]));
    for (const removed of removedInventory) {
      const basePart = baseInventory.find((part) => String(part.itemId) === removed.itemId);
      const item = byId.get(removed.itemId);
      if (!basePart || !item || item.category !== "component" || removed.quantity > basePart.quantity) {
        return NextResponse.json({ available: false, message: "Só é possível retirar peças visíveis que já fazem parte deste kit." }, { status: 400 });
      }
    }

    const requested = new Map<string, number>();
    for (const part of baseInventory) {
      const id = String(part.itemId);
      requested.set(id, (requested.get(id) ?? 0) + part.quantity - (removedById.get(id) ?? 0));
    }
    for (const part of customInventory) requested.set(part.itemId, (requested.get(part.itemId) ?? 0) + part.quantity);

    // Uma estrutura pode servir a várias peças: reserva-se a maior quantidade exigida.
    const requiredStructures = new Map<string, number>();
    for (const [itemId, quantity] of requested) {
      if (quantity <= 0) continue;
      const item = byId.get(itemId);
      if (item?.category === "component" && item.requiresStructureId) {
        const structureId = String(item.requiresStructureId);
        requiredStructures.set(structureId, Math.max(requiredStructures.get(structureId) ?? 0, quantity));
      }
    }
    for (const [structureId, requiredQuantity] of requiredStructures) {
      requested.set(structureId, Math.max(requested.get(structureId) ?? 0, requiredQuantity));
    }

    const allById = new Map([...items, ...structures].map((item) => [String(item._id), item]));
    for (const [itemId, quantity] of requested) {
      if (quantity <= 0) continue;
      const item = allById.get(itemId);
      if (!item || item.totalQuantity - (used.get(itemId) ?? 0) < quantity) {
        return NextResponse.json({ available: false, message: "A combinação escolhida excede o estoque disponível para essa data." }, { status: 409 });
      }
    }
    return NextResponse.json({
      available: true,
      message: "Data disponível. A estrutura necessária será contabilizada automaticamente no estoque.",
      kit: product.name,
      returnDate: returnDate.toISOString().slice(0, 10),
    });
  } catch (error) {
    console.error("Falha ao consultar disponibilidade:", error);
    return NextResponse.json({ error: "Não foi possível validar a disponibilidade agora." }, { status: 503 });
  }
}
