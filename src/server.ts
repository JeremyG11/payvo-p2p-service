import app from "@/app";
import { config } from "@/config/env";
import { logger } from "@/lib/logger";
import kafkaInit from "@/config/kafka";
import { initRedis } from "@/config/radis";

const port = config.port as number;
const host = process.env.HOST || "0.0.0.0";

const startServer = async () => {
  try {
    /**
     * Connect to Kafka and Redis
     */
    await kafkaInit();
    await initRedis();
  } catch (error) {
    logger.error("Error connecting to Kafka or Redis:", error);
    process.exit(1);
  }

  app.listen(port, host, () => {
    logger.info(`Server started on http://${host}:${port}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("Shutting down gracefully...");
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("Shutting down gracefully...");
    process.exit(0);
  });
};

startServer();
