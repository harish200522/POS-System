import mongoose from "mongoose";

const inventoryLogSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["add", "deduct", "set", "sale"],
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    previousStock: {
      type: Number,
      required: true,
      min: 0,
    },
    newStock: {
      type: Number,
      required: true,
      min: 0,
    },
    referenceType: {
      type: String,
      required: true,
      enum: ["manual", "restock", "adjustment", "sale"],
      default: "manual",
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

inventoryLogSchema.index({ createdAt: -1 });

const InventoryLog = mongoose.model("InventoryLog", inventoryLogSchema);

export default InventoryLog;
