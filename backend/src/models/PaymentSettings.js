import mongoose from "mongoose";

const paymentSettingsSchema = new mongoose.Schema(
  {
    shopId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 120,
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

const PaymentSettings = mongoose.model("PaymentSettings", paymentSettingsSchema);

export default PaymentSettings;
