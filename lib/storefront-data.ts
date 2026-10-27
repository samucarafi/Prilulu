import { connectMongoDB } from "@/lib/mongodb";
import Kit from "@/models/Kit";
import InventoryItem from "@/models/InventoryItem";
import Promotion from "@/models/Promotion";

export type StorePiece = { id: string; name: string; family: string; color: string; size: string; price: number; image?: string; stock: number; quantity?: number; requiresStructureId?: string };
export type StoreKit = { id: string; name: string; theme: string; price: number; color: string; art: string; badge: string; image?: string; customizable?: boolean; allowCustomerEdits?: boolean; customBasePrice?: number; pieces?: StorePiece[]; includedPieces?: StorePiece[] };
export type StoreExtraOption = { id: string; name: string; image?: string; priceDelta: number; stockQuantity: number | null };
export type StoreExtraGroup = { id: string; name: string; required: boolean; options: StoreExtraOption[] };
export type StoreExtra = { id: string; name: string; price: number; image?: string; optionGroups: StoreExtraGroup[] };

const colors = ["#f3d8d6", "#f6d98a", "#d5dfbf", "#d9d8ef", "#f2d4b8"];
const art = ["🎀", "🎪", "🦒", "🌈", "🎂"];

export async function getStorefrontData() {
  try {
    await connectMongoDB();
    const [kits, extras, promotions, pieces] = await Promise.all([
      Kit.find({ active: true }).populate({ path: "inventory.itemId", model: InventoryItem, select: "name category family color size totalQuantity available image customPriceCents requiresStructureId" }).sort({ featured: -1, createdAt: -1 }).lean(),
      InventoryItem.find({ category: "extra", available: true, totalQuantity: { $gt: 0 } }).sort({ name: 1 }).lean(),
      Promotion.find({ active: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: new Date() } }] }, { $or: [{ endsAt: null }, { endsAt: { $gte: new Date() } }] }] }).sort({ position: 1 }).lean(),
      InventoryItem.find({ category: "component", available: true, totalQuantity: { $gt: 0 } }).sort({ family: 1, name: 1 }).lean(),
    ]);
    const availableKits = kits.filter((kit) => kit.inventory.length > 0 && kit.inventory.every((part) => {
      const item = part.itemId as unknown as { available?: boolean; totalQuantity?: number } | null;
      return item && item.available && (item.totalQuantity ?? 0) >= part.quantity;
    }));
    const extraRecords = extras as unknown as Array<{ _id: unknown; name: string; priceCents: number; image?: string; optionGroups?: Array<{ id: string; name: string; required: boolean; options: Array<{ id: string; name: string; image?: string; priceDeltaCents: number; stockQuantity: number | null }> }> }>;
    return {
      connected: true,
      kits: availableKits.map((kit, index) => {
        const componentPieces = pieces as unknown as Array<{ _id: unknown; name: string; family?: string; color?: string; size?: string; customPriceCents?: number; image?: string; totalQuantity: number; requiresStructureId?: unknown }>;
        const toStorePiece = (piece: typeof componentPieces[number], quantity?: number): StorePiece => ({ id: String(piece._id), name: piece.name, family: piece.family || "Peça", color: piece.color || "", size: piece.size || "", price: (piece.customPriceCents ?? 0) / 100, image: piece.image || undefined, stock: piece.totalQuantity, ...(quantity ? { quantity } : {}), requiresStructureId: piece.requiresStructureId ? String(piece.requiresStructureId) : undefined });
        const includedPieces = (kit.inventory ?? []).flatMap((part) => {
          const item = part.itemId as unknown as { _id: unknown; category?: string; name: string; family?: string; color?: string; size?: string; customPriceCents?: number; image?: string; totalQuantity: number; requiresStructureId?: unknown } | null;
          if (!item || item.category !== "component") return [];
          return [toStorePiece(item as typeof componentPieces[number], part.quantity)];
        });
        const includedFamilies = new Set(includedPieces.map((piece) => piece.family));
        const baseStructures = new Set((kit.inventory ?? []).flatMap((part) => {
          const item = part.itemId as unknown as { _id: unknown; category?: string } | null;
          return item?.category === "structure" ? [String(item._id)] : [];
        }));
        const selectedIds = new Set((kit.customizableItemIds ?? []).map((id) => String(id)));
        const selectablePieces = componentPieces.filter((piece) => {
          if (kit.customizable) return !selectedIds.size || selectedIds.has(String(piece._id));
          const sameFamilyAsIncluded = includedFamilies.has(piece.family || "Peça");
          const hasItsStructure = !piece.requiresStructureId || baseStructures.has(String(piece.requiresStructureId));
          return sameFamilyAsIncluded || hasItsStructure;
        }).map((piece) => toStorePiece(piece));
        return { id: kit.slug, name: kit.name, theme: kit.theme || "Kit pegue e monte", price: kit.priceCents / 100, color: colors[index % colors.length], art: art[index % art.length], badge: kit.featured ? "Em destaque" : "", image: kit.image || undefined, customizable: Boolean(kit.customizable), allowCustomerEdits: !kit.customizable || Boolean(kit.allowCustomerEdits), customBasePrice: (kit.customBasePriceCents ?? kit.priceCents) / 100, pieces: selectablePieces, includedPieces };
      }),
      extras: extraRecords.map((item) => ({ id: String(item._id), name: item.name, price: item.priceCents / 100, image: item.image || undefined, optionGroups: (item.optionGroups ?? []).map((group) => ({ id: group.id, name: group.name, required: group.required, options: group.options.map((option) => ({ id: option.id, name: option.name, image: option.image || undefined, priceDelta: option.priceDeltaCents / 100, stockQuantity: option.stockQuantity ?? null })) })) })),
      promotions: promotions.map((promotion) => ({ title: promotion.title, subtitle: promotion.subtitle, image: promotion.image, href: promotion.href })),
    };
  } catch (error) {
    console.error("Catálogo indisponível:", error);
    return { connected: false, kits: [] as StoreKit[], extras: [] as StoreExtra[], promotions: [] };
  }
}
