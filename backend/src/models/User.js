import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
      index: true,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    shopId: {
      type: String,
      required: true,
      trim: true,
      default: "default-shop",
      maxlength: 120,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      minlength: 40,
    },
    role: {
      type: String,
      enum: ["admin", "cashier"],
      default: "cashier",
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

export default User;
