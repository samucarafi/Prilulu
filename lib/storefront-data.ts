import { connectMongoDB } from "@/lib/mongodb";
import Kit from "@/models/Kit";
import InventoryItem from "@/models/InventoryItem";
import Promotion from "@/models/Promotion";

export type StoreKit = { id: string; name: string; theme: string; price: number; color: string; art: string; badge: string; image?: string };
export type StoreExtra = { id: string; name: string; price: number; image?: string };

const colors = ["#f3d8d6", "#f6d98a", "#d5dfbf", "#d9d8ef", "#f2d4b8"];
const art = ["🎀", "🎪", "🦒", "🌈", "🎂"];

export async function getStorefrontData() {
  try {
    await connectMongoDB();
    const [kits, extras, promotions] = await Promise.all([
      Kit.find({ active: true }).populate({ path: "inventory.itemId", model: InventoryItem, select: "name totalQuantity available" }).sort({ featured: -1, createdAt: -1 }).lean(),
      InventoryItem.find({ category: "extra", available: true, totalQuantity: { $gt: 0 } }).sort({ name: 1 }).lean(),
      Promotion.find({ active: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: new Date() } }] }, { $or: [{ endsAt: null }, { endsAt: { $gte: new Date() } }] }] }).sort({ position: 1 }).lean(),
    ]);
    const availableKits = kits.filter((kit) => kit.inventory.length > 0 && kit.inventory.every((part) => {
      const item = part.itemId as unknown as { available?: boolean; totalQuantity?: number } | null;
      return item && item.available && (item.totalQuantity ?? 0) >= part.quantity;
    }));
    return {
      connected: true,
      kits: availableKits.map((kit, index) => ({ id: kit.slug, name: kit.name, theme: kit.theme || "Kit pegue e monte", price: kit.priceCents / 100, color: colors[index % colors.length], art: art[index % art.length], badge: kit.featured ? "Em destaque" : "", image: kit.image || undefined })),
      extras: extras.map((item) => ({ id: String(item._id), name: item.name, price: item.priceCents / 100, image: item.image || undefined })),
      promotions: promotions.map((promotion) => ({ title: promotion.title, subtitle: promotion.subtitle, image: promotion.image, href: promotion.href })),
    };
  } catch (error) {
    console.error("Catálogo indisponível:", error);
    return { connected: false, kits: [] as StoreKit[], extras: [] as StoreExtra[], promotions: [] };
  }
}
