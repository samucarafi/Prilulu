import mongoose, { Schema } from "mongoose";

const promotionSchema = new Schema({
  title: { type: String, required: true, trim: true },
  subtitle: { type: String, default: "" },
  image: { type: String, default: "" },
  href: { type: String, default: "/kits" },
  startsAt: Date,
  endsAt: Date,
  active: { type: Boolean, default: false },
  position: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.models.Promotion || mongoose.model("Promotion", promotionSchema);
