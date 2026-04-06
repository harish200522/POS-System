import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase(uri) {
  if (!uri) {
    throw new Error("MONGO_URI is required");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    autoIndex: !env.isProduction,
    maxPoolSize: env.isProduction ? 20 : 10,
    serverSelectionTimeoutMS: 12000,
  });

  return mongoose.connection;
}
