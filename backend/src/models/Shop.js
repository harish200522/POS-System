import mongoose from "mongoose";

function normalizePhone(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^\d+]/g, "");
}

const shopSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
      index: true,
    },
    ownerName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      set: normalizePhone,
      match: /^\+?[1-9]\d{7,14}$/,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
  },
  {
    timestamps: true,
  }
);

const Shop = mongoose.model("Shop", shopSchema);

export default Shop;