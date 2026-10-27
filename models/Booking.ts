import mongoose, { Schema } from "mongoose";

const bookingSchema = new Schema({
  customerName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  eventDate: { type: Date, required: true, index: true },
  returnDate: { type: Date, required: true },
  kit: { type: Schema.Types.ObjectId, ref: "Kit", required: true },
  customInventory: [{ itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem" }, name: String, family: String, color: String, size: String, image: String, unitPriceCents: Number, quantity: { type: Number, min: 1 } }],
  removedInventory: [{ itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem" }, quantity: { type: Number, min: 1 } }],
  extras: [{
    item: { type: Schema.Types.ObjectId, ref: "InventoryItem" },
    quantity: { type: Number, min: 1 },
    selectedOptions: [{ groupId: String, groupName: String, optionId: String, optionName: String, image: String, priceDeltaCents: Number }],
  }],
  totalCents: { type: Number, required: true, min: 0 },
  depositCents: { type: Number, required: true, min: 0 },
  coupon: { type: Schema.Types.ObjectId, ref: "Coupon" },
  status: { type: String, enum: ["awaiting_contact", "awaiting_deposit", "confirmed", "picked_up", "returned", "cancelled"], default: "awaiting_contact", index: true },
  depositPaymentId: String,
  paymentPreferenceId: String,
}, { timestamps: true });

bookingSchema.index({ kit: 1, eventDate: 1, status: 1 });
bookingSchema.index({ eventDate: 1, returnDate: 1, status: 1 });
export default mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
