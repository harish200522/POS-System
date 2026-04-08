import mongoose from "mongoose";

const invoiceShareSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
      index: true,
    },
    shareId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

invoiceShareSchema.index({ shopId: 1, invoiceId: 1 }, { unique: true });
invoiceShareSchema.index({ expiresAt: 1 });

const InvoiceShare = mongoose.model("InvoiceShare", invoiceShareSchema);

export default InvoiceShare;