import mongoose from "mongoose";

const upiPaymentSessionSchema = new mongoose.Schema(
  {
    shopId: {
      type: String,
      required: true,
      index: true,
      trim: true,
      maxlength: 120,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    provider: {
      type: String,
      required: true,
      default: "razorpay",
      enum: ["razorpay"],
      trim: true,
    },
    providerPaymentLinkId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    providerPaymentUrl: {
      type: String,
      required: true,
      trim: true,
    },
    providerStatus: {
      type: String,
      required: true,
      default: "created",
      trim: true,
    },
    status: {
      type: String,
      required: true,
      default: "pending",
      enum: ["pending", "paid", "completing", "completed", "cancelled", "expired", "failed"],
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      trim: true,
    },
    upiId: {
      type: String,
      required: true,
      trim: true,
    },
    shopName: {
      type: String,
      required: true,
      trim: true,
    },
    upiLink: {
      type: String,
      required: true,
      trim: true,
    },
    billingPayload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    summary: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    completedSaleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      default: null,
    },
    completionSource: {
      type: String,
      enum: ["auto_poll", "manual_confirm", "webhook"],
      default: null,
    },
    statusMessage: {
      type: String,
      trim: true,
      default: "Waiting for payment",
      maxlength: 180,
    },
    lastStatusCheckedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

upiPaymentSessionSchema.index({ createdAt: -1 });

const UpiPaymentSession = mongoose.model("UpiPaymentSession", upiPaymentSessionSchema);

export default UpiPaymentSession;
