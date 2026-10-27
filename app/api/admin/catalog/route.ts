import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { connectMongoDB } from "@/lib/mongodb";
import Kit from "@/models/Kit";
import InventoryItem from "@/models/InventoryItem";
import Booking from "@/models/Booking";
import Coupon from "@/models/Coupon";
import Promotion from "@/models/Promotion";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  try {
    await connectMongoDB();
    const [items, kits, bookings, coupons, promotions] = await Promise.all([
      InventoryItem.find().sort({ name: 1 }).lean(),
      Kit.find().populate("inventory.itemId").sort({ name: 1 }).lean(),
      Booking.find().populate("kit").sort({ createdAt: -1 }).limit(100).lean(),
      Coupon.find().sort({ createdAt: -1 }).lean(),
      Promotion.find().sort({ position: 1 }).lean(),
    ]);
    return NextResponse.json({ items, kits, bookings, coupons, promotions });
  } catch (error) {
    console.error("Falha ao carregar o painel:", error);
    return NextResponse.json({ error: "Não foi possível carregar os dados do painel." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  try {
    await connectMongoDB();
    const body = await request.json();
    if (body.type === "item") {
      const name = String(body.name ?? "").trim();
      const category = body.category;
      const totalQuantity = Number(body.totalQuantity);
      const priceCents = Math.round(Number(body.price) * 100);
      if (!name || !["component", "extra"].includes(category) || !Number.isInteger(totalQuantity) || totalQuantity < 0 || !Number.isFinite(priceCents) || priceCents < 0) return NextResponse.json({ error: "Confira nome, tipo, quantidade e preço." }, { status: 400 });
      const image = typeof body.image === "string" && body.image.startsWith("/uploads/") ? body.image : "";
      const item = await InventoryItem.create({ name, category, totalQuantity, priceCents, image, available: true });
      return NextResponse.json({ ok: true, id: item.id }, { status: 201 });
    }
    if (body.type === "kit") {
      const name = String(body.name ?? "").trim();
      const slug = String(body.slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
      const priceCents = Math.round(Number(body.price) * 100);
      const inventory = Array.isArray(body.inventory) ? body.inventory.filter((part: { itemId?: unknown; quantity?: unknown }) => typeof part.itemId === "string" && Number.isInteger(Number(part.quantity)) && Number(part.quantity) > 0).map((part: { itemId: string; quantity: number }) => ({ itemId: part.itemId, quantity: Number(part.quantity) })) : [];
      const items = await InventoryItem.find({ _id: { $in: inventory.map((part: { itemId: string }) => part.itemId) }, available: true }).lean();
      if (!name || !slug || !Number.isFinite(priceCents) || priceCents < 0 || !inventory.length || items.length !== new Set(inventory.map((part: { itemId: string }) => part.itemId)).size) return NextResponse.json({ error: "Informe nome, slug, preço e componentes válidos para o kit." }, { status: 400 });
      const image = typeof body.image === "string" && body.image.startsWith("/uploads/") ? body.image : "";
      const kit = await Kit.create({ name, slug, theme: String(body.theme ?? "").trim(), priceCents, image, inventory, active: true, featured: Boolean(body.featured) });
      return NextResponse.json({ ok: true, id: kit.id }, { status: 201 });
    }
    if (body.type === "coupon") {
      const code = String(body.code ?? "").trim().toUpperCase().replace(/\s+/g, "");
      const discountPercent = Number(body.discountPercent);
      const maxUses = Number(body.maxUses);
      if (!code || !Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100 || !Number.isInteger(maxUses) || maxUses < 1) return NextResponse.json({ error: "Informe código, desconto percentual e limite de usos válidos." }, { status: 400 });
      const coupon = await Coupon.create({ code, discountPercent, maxUses, active: true });
      return NextResponse.json({ ok: true, id: coupon.id }, { status: 201 });
    }
    if (body.type === "promotion") {
      const title = String(body.title ?? "").trim();
      const subtitle = String(body.subtitle ?? "").trim();
      if (!title) return NextResponse.json({ error: "Informe o título da divulgação." }, { status: 400 });
      const promotion = await Promotion.create({ title, subtitle, active: true, position: 0, href: "/#catalogo" });
      return NextResponse.json({ ok: true, id: promotion.id }, { status: 201 });
    }
    return NextResponse.json({ error: "Tipo de cadastro desconhecido." }, { status: 400 });
  } catch (error) {
    console.error("Falha ao gravar no painel:", error);
    return NextResponse.json({ error: "Não foi possível salvar. Verifique os dados e tente novamente." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  try {
    await connectMongoDB();
    const body = await request.json();
    const id = String(body.id ?? "");
    if (body.type === "item") {
      const update: Record<string, unknown> = {};
      if (body.totalQuantity !== undefined) {
        const quantity = Number(body.totalQuantity);
        if (!Number.isInteger(quantity) || quantity < 0) return NextResponse.json({ error: "Quantidade inválida." }, { status: 400 });
        const bookings = await Booking.find({ status: { $in: ["awaiting_deposit", "confirmed", "picked_up"] } }).populate({ path: "kit", select: "inventory" }).lean();
        const useByDate = new Map<string, number>();
        for (const booking of bookings) {
          const kit = booking.kit as unknown as { inventory?: Array<{ itemId: unknown; quantity: number }> } | null;
          const dateKey = booking.eventDate.toISOString().slice(0, 10);
          let usedOnDate = 0;
          for (const part of kit?.inventory ?? []) if (String(part.itemId) === id) usedOnDate += part.quantity;
          for (const extra of booking.extras ?? []) if (String(extra.item) === id) usedOnDate += extra.quantity ?? 1;
          useByDate.set(dateKey, (useByDate.get(dateKey) ?? 0) + usedOnDate);
        }
        const peakUse = Math.max(0, ...useByDate.values());
        if (quantity < peakUse) return NextResponse.json({ error: `A quantidade não pode ficar abaixo das ${peakUse} unidades já reservadas para uma data.` }, { status: 409 });
        update.totalQuantity = quantity;
      }
      if (body.available !== undefined) update.available = Boolean(body.available);
      if (typeof body.image === "string" && body.image.startsWith("/uploads/")) update.image = body.image;
      const item = await InventoryItem.findByIdAndUpdate(id, update, { new: true, runValidators: true });
      if (!item) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    if (body.type === "kit") {
      const update: Record<string, unknown> = {};
      if (body.active === true) {
        const kit = await Kit.findById(id).lean();
        if (!kit?.inventory?.length) return NextResponse.json({ error: "Cadastre peças no inventário antes de publicar este kit." }, { status: 409 });
        const parts = await InventoryItem.find({ _id: { $in: kit.inventory.map((part) => part.itemId) }, available: true }).lean();
        if (parts.length !== kit.inventory.length || kit.inventory.some((part) => {
          const item = parts.find((entry) => String(entry._id) === String(part.itemId));
          return !item || item.totalQuantity < part.quantity;
        })) return NextResponse.json({ error: "Não há estoque ativo suficiente para publicar este kit." }, { status: 409 });
      }
      if (body.active !== undefined) update.active = Boolean(body.active);
      if (body.featured !== undefined) update.featured = Boolean(body.featured);
      if (typeof body.image === "string" && body.image.startsWith("/uploads/")) update.image = body.image;
      const kit = await Kit.findByIdAndUpdate(id, update, { new: true, runValidators: true });
      if (!kit) return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    if (body.type === "booking") {
      if (!["awaiting_deposit", "confirmed", "picked_up", "returned", "cancelled"].includes(body.status)) return NextResponse.json({ error: "Status de reserva inválido." }, { status: 400 });
      const booking = await Booking.findByIdAndUpdate(id, { status: body.status }, { new: true, runValidators: true });
      if (!booking) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    if (body.type === "coupon") {
      const coupon = await Coupon.findByIdAndUpdate(id, { active: Boolean(body.active) }, { new: true });
      if (!coupon) return NextResponse.json({ error: "Cupom não encontrado." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    if (body.type === "promotion") {
      const promotion = await Promotion.findByIdAndUpdate(id, { active: Boolean(body.active) }, { new: true });
      if (!promotion) return NextResponse.json({ error: "Divulgação não encontrada." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Tipo de atualização desconhecido." }, { status: 400 });
  } catch (error) {
    console.error("Falha ao atualizar pelo painel:", error);
    return NextResponse.json({ error: "Não foi possível atualizar este registro." }, { status: 400 });
  }
}
