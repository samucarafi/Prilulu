import mongoose, { Schema } from "mongoose";

const kitSchema = new Schema({
  slug: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  theme: { type: String, default: "" },
  description: { type: String, default: "" },
  priceCents: { type: Number, required: true, min: 0 },
  image: { type: String, default: "" },
  active: { type: Boolean, default: true, index: true },
  featured: { type: Boolean, default: false },
  inventory: [{ itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true }, quantity: { type: Number, required: true, min: 1 } }],
}, { timestamps: true });

export default mongoose.models.Kit || mongoose.model("Kit", kitSchema);
