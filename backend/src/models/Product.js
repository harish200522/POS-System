import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    barcode: {
      type: String,
      required: true,
      trim: true,
      set: (value) => String(value ?? "").trim(),
    },
    category: {
      type: String,
      trim: true,
      default: "General",
      maxlength: 80,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

productSchema.index({ shopId: 1, barcode: 1 }, { unique: true });
productSchema.index({ shopId: 1, name: "text", barcode: "text" });

const Product = mongoose.model("Product", productSchema);

export default Product;
