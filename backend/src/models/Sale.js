import mongoose from "mongoose";

const saleItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    barcode: {
      type: String,
      required: true,
      trim: true,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [saleItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "At least one item is required for sale",
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    tax: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["cash", "upi"],
      lowercase: true,
      trim: true,
    },
    paidAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    changeDue: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    cashier: {
      type: String,
      trim: true,
      default: "Default Cashier",
      maxlength: 100,
    },
    source: {
      type: String,
      enum: ["online", "offline_sync"],
      default: "online",
    },
  },
  {
    timestamps: true,
  }
);

saleSchema.index({ createdAt: -1 });

const Sale = mongoose.model("Sale", saleSchema);

export default Sale;
