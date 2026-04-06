import dns from "node:dns";
import app from "./app.js";
import { connectDatabase } from "./config/db.js";
import { assertValidEnv, env } from "./config/env.js";

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
  try {
    assertValidEnv();
    configureDnsResolvers();

    console.log(`Starting POS backend in ${env.nodeEnv} mode`);

    const connection = await connectDatabase(env.mongoUri);
    console.log(`MongoDB connection status: connected (${connection.host})`);

    connection.on("disconnected", () => {
      console.warn("MongoDB connection status: disconnected");
    });
    connection.on("reconnected", () => {
      console.log("MongoDB connection status: reconnected");
    });
    connection.on("error", (connectionError) => {
      console.error(`MongoDB connection status: error (${connectionError.message})`);
    });

    const server = app.listen(PORT, () => {
      console.log("Server started");
      console.log(`Port: ${PORT}`);
    });

    const gracefulShutdown = async (signal) => {
      console.log(`Received ${signal}. Shutting down server gracefully...`);
      server.close(async () => {
        try {
          await connection.close();
          console.log("MongoDB connection closed");
        } finally {
          process.exit(0);
        }
      });
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  } catch (error) {
    const message = String(error?.message || "Unknown startup error");
    console.error(`Failed to start POS backend:\n${message}`);

    if (/whitelist|ip|srv|dns|connect|timed out|econnrefused|enotfound|authentication failed/i.test(message)) {
      console.error(
        "Atlas connectivity checklist: verify cluster is running, network access allows this server IP, DB user is valid, and MONGO_URI points to the correct database."
      );
    }

    process.exit(1);
  }
}

startServer();
