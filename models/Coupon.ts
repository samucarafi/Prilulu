import mongoose, { Schema } from "mongoose";

const couponSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountPercent: { type: Number, min: 1, max: 100 },
  discountCents: { type: Number, min: 0 },
  minimumCents: { type: Number, default: 0, min: 0 },
  startsAt: Date,
  expiresAt: Date,
  maxUses: { type: Number, min: 1 },
  uses: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);
