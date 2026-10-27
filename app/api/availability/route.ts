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
    const eventDate = new Date(`${body.date}T12:00:00.000Z`);
    if (!kit || !/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") || Number.isNaN(eventDate.getTime())) {
      return NextResponse.json({ error: "Informe um kit e uma data válidos." }, { status: 400 });
    }
    await connectMongoDB();
    const returnDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
    const product = await Kit.findOne({ slug: kit, active: true }).lean();
    if (!product) return NextResponse.json({ available: false, message: "Kit indisponível." }, { status: 404 });
    if (!product.inventory?.length) return NextResponse.json({ available: false, message: "Este kit ainda não está ligado ao inventário." }, { status: 409 });

    // Inventory remains unavailable from the event through the following day's return.
    const activeBookings = await Booking.find({ eventDate: { $lte: returnDate }, status: { $in: ["awaiting_deposit", "confirmed", "picked_up"] } })
      .populate({ path: "kit", select: "inventory" }).lean();
    const used = peakInventoryUsage(activeBookings as unknown as InventoryUsageBooking[], { start: eventDate, end: returnDate });
    const inventoryIds = product.inventory.map((part) => part.itemId);
    const inventory = await InventoryItem.find({ _id: { $in: inventoryIds }, available: true }).lean();
    if (inventory.length !== inventoryIds.length) return NextResponse.json({ available: false, message: "Há itens deste kit sem estoque ativo." }, { status: 409 });
    const notAvailable = product.inventory.some((part) => {
      const item = inventory.find((entry) => String(entry._id) === String(part.itemId));
      return !item || item.totalQuantity - (used.get(String(part.itemId)) ?? 0) < part.quantity;
    });
    if (notAvailable) return NextResponse.json({ available: false, message: "Os itens deste kit já estão comprometidos para essa data." }, { status: 409 });
    return NextResponse.json({ available: true, message: "Data disponível. O kit fica reservado da festa até a devolução no dia seguinte, após confirmação da loja.", kit: product.name, returnDate: returnDate.toISOString().slice(0, 10) });
  } catch (error) {
    console.error("Falha ao consultar disponibilidade:", error);
    return NextResponse.json({ error: "Não foi possível validar a disponibilidade agora." }, { status: 503 });
  }
}
