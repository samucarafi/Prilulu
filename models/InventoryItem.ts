import mongoose, { Schema } from "mongoose";

const inventoryItemSchema = new Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: ["kit", "extra", "component"], required: true },
  totalQuantity: { type: Number, required: true, min: 0 },
  priceCents: { type: Number, default: 0, min: 0 },
  image: { type: String, default: "" },
  available: { type: Boolean, default: true },
  lowStockThreshold: { type: Number, default: 1, min: 0 },
  reservationLockToken: { type: String, default: undefined },
  reservationLockUntil: { type: Date, default: undefined },
}, { timestamps: true });

export default mongoose.models.InventoryItem || mongoose.model("InventoryItem", inventoryItemSchema);
