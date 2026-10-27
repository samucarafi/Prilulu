import mongoose, { Schema } from "mongoose";

const optionSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  image: { type: String, default: "" },
  imagePublicId: { type: String, default: "" },
  priceDeltaCents: { type: Number, default: 0 },
  stockQuantity: { type: Number, default: null, min: 0 },
}, { _id: false });

const optionGroupSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  required: { type: Boolean, default: true },
  options: { type: [optionSchema], default: [] },
}, { _id: false });

const inventoryItemSchema = new Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: ["kit", "extra", "component", "structure"], required: true },
  family: { type: String, default: "", trim: true, index: true },
  theme: { type: String, default: "", trim: true, index: true },
  color: { type: String, default: "", trim: true },
  size: { type: String, default: "", trim: true },
  totalQuantity: { type: Number, required: true, min: 0 },
  priceCents: { type: Number, default: 0, min: 0 },
  customPriceCents: { type: Number, default: 0, min: 0 },
  requiresStructureId: { type: Schema.Types.ObjectId, ref: "InventoryItem", default: null },
  image: { type: String, default: "" },
  imagePublicId: { type: String, default: "" },
  optionGroups: { type: [optionGroupSchema], default: [] },
  available: { type: Boolean, default: true },
  lowStockThreshold: { type: Number, default: 1, min: 0 },
  reservationLockToken: { type: String, default: undefined },
  reservationLockUntil: { type: Date, default: undefined },
}, { timestamps: true });

export default mongoose.models.InventoryItem || mongoose.model("InventoryItem", inventoryItemSchema);
