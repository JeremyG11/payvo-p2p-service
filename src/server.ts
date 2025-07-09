import dotenv from "dotenv";
dotenv.config();

import "module-alias/register";
import app from "@/app";
import kafkaInit from "@/config/kafka";
import { config } from "@/config/env";

const PORT = config.port;

const startServer = async () => {
  try {
    await kafkaInit();
  } catch (error) {
    console.error("Error connecting to Kafka:", error);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
};

startServer();
