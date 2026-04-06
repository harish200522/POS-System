import mongoose from "mongoose";
import { env } from "./env.js";

function validateMongoUri(uri) {
  if (!uri) {
    throw new Error("MONGO_URI is required");
  }

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("MONGO_URI must be a valid MongoDB connection string");
  }

  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) {
    throw new Error("MONGO_URI must start with mongodb:// or mongodb+srv://");
  }
}

export async function connectDatabase(uri) {
  validateMongoUri(uri);

  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, {
      autoIndex: !env.isProduction,
      maxPoolSize: env.isProduction ? 20 : 10,
      serverSelectionTimeoutMS: 12000,
    });
  } catch (error) {
    throw new Error(`MongoDB connection failed: ${error.message}`);
  }

  return mongoose.connection;
}
