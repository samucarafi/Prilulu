import mongoose, { Schema, type Model } from "mongoose";

export type CouponRecord = {
  code: string;
  discountPercent?: number;
  discountCents?: number;
  minimumCents: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  maxUses?: number;
  uses: number;
  active: boolean;
};

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

const Coupon = (mongoose.models.Coupon as Model<CouponRecord> | undefined) ?? mongoose.model<CouponRecord>("Coupon", couponSchema);
export default Coupon;
