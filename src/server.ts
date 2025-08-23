import http from "http";
import app from "@/app";
import { config } from "@/config/env";
import { logger } from "@/lib/logger";
import { initRedis, shutdownRedis } from "@/config/radis";
import kafkaInit, { disconnectKafka } from "@/config/kafka";
import { getAppRolesPermissionsFromRedis } from "./lib/cache-utils";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(config.port) || 5001;

async function bootstrap() {
  try {
    if (!config.jwtPublicKey) {
      throw new Error("JWT keys must be defined in environment.");
    }

    await kafkaInit();
    await initRedis();

    await getAppRolesPermissionsFromRedis();
    logger.info("✅ RBAC data is available in Redis");
  } catch (error) {
    logger.warn("⚠️  RBAC data not yet available in Redis.");
    logger.warn(
      "This is expected if Auth service is starting up or hasn't loaded data yet."
    );
  }
}
async function startServer() {
  try {
    await bootstrap();

    const server = http.createServer(app);
    server.listen(PORT, HOST, () => {
      logger.info(`🚀 Server listening at http://${HOST}:${PORT}`);
    });

    // Graceful shutdown helper
    const graceful = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down…`);

      // Stop accepting new HTTP
      server.close((err) => {
        if (err) logger.error("Error closing HTTP server:", err);
        else logger.info("HTTP server closed");
      });

      // Kafka & Redis cleanup
      await disconnectKafka();
      await shutdownRedis();

      process.exit(0);
    };

    process.on("SIGINT", () => graceful("SIGINT"));
    process.on("SIGTERM", () => graceful("SIGTERM"));

    process.on("uncaughtException", (err) => {
      logger.error("Uncaught exception:", err);
      process.exit(1);
    });
    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  } catch (err) {
    logger.error("Bootstrap failed:", err);
    process.exit(1);
  }
}

startServer();
