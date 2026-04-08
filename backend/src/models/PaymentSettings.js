import mongoose from "mongoose";

const paymentSettingsSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
    upiId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    qrImage: {
      type: String,
      trim: true,
      default: "",
      maxlength: 750000,
    },
  },
  {
    timestamps: true,
  }
);

paymentSettingsSchema.index({ shopId: 1 }, { unique: true });

const PaymentSettings = mongoose.model("PaymentSettings", paymentSettingsSchema);

export default PaymentSettings;
