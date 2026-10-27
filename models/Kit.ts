import mongoose, { Schema, type Model } from "mongoose";

export type KitRecord = {
  slug: string;
  name: string;
  theme: string;
  description: string;
  priceCents: number;
  image: string;
  imagePublicId: string;
  active: boolean;
  featured: boolean;
  customizable?: boolean;
  allowCustomerEdits?: boolean;
  customBasePriceCents?: number;
  customizableItemIds?: mongoose.Types.ObjectId[];
  inventory: Array<{ itemId: mongoose.Types.ObjectId; quantity: number }>;
};

const kitSchema = new Schema({
  slug: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  theme: { type: String, default: "" },
  description: { type: String, default: "" },
  priceCents: { type: Number, required: true, min: 0 },
  image: { type: String, default: "" },
  imagePublicId: { type: String, default: "" },
  active: { type: Boolean, default: true, index: true },
  featured: { type: Boolean, default: false },
  customizable: { type: Boolean, default: false, index: true },
  allowCustomerEdits: { type: Boolean, default: false, index: true },
  customBasePriceCents: { type: Number, default: 0, min: 0 },
  customizableItemIds: [{ type: Schema.Types.ObjectId, ref: "InventoryItem" }],
  inventory: [{ itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true }, quantity: { type: Number, required: true, min: 1 } }],
}, { timestamps: true });

const Kit = (mongoose.models.Kit as Model<KitRecord> | undefined) ?? mongoose.model<KitRecord>("Kit", kitSchema);
export default Kit;
