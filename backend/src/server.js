import dns from "node:dns";
import app from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";

const PORT = env.port;

function configureDnsResolvers() {
  const resolvers = env.dnsServers
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!resolvers.length) {
    return;
  }

  dns.setServers(resolvers);
  console.log(`Using custom DNS resolvers: ${resolvers.join(", ")}`);
}

async function startServer() {
  let memoryServer = null;

  try {
    configureDnsResolvers();

    let connection;

    try {
      connection = await connectDatabase(env.mongoUri);
      console.log(`MongoDB connected: ${connection.host}`);
    } catch (connectionError) {
      if (!env.allowInMemoryDb || env.isProduction) {
        const message = String(connectionError?.message || "");
        if (/whitelist|ip|srv|dns|connect|timed out/i.test(message)) {
          console.error(
            "Atlas connectivity checklist: verify cluster is running, network access allows this server IP, DB user is valid, and MONGO_URI points to the correct database."
          );
        }
        throw connectionError;
      }

      console.warn(`Primary MongoDB connection failed: ${connectionError.message}`);
      console.warn("Starting in-memory MongoDB fallback...");

      const { MongoMemoryServer } = await import("mongodb-memory-server");
      memoryServer = await MongoMemoryServer.create();
      const inMemoryUri = memoryServer.getUri();
      connection = await connectDatabase(inMemoryUri);

      console.log(`In-memory MongoDB connected: ${connection.host}`);
    }

    const server = app.listen(PORT, () => {
      console.log(`POS backend running at http://127.0.0.1:${PORT}`);
    });

    const gracefulShutdown = async (signal) => {
      console.log(`Received ${signal}. Shutting down server gracefully...`);
      server.close(async () => {
        try {
          await connection.close();
          console.log("MongoDB connection closed");

          if (memoryServer) {
            await memoryServer.stop();
            console.log("In-memory MongoDB stopped");
          }
        } finally {
          process.exit(0);
        }
      });
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start POS backend:", error.message);
    process.exit(1);
  }
}

startServer();
