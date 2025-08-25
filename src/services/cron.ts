import cron, { ScheduledTask } from "node-cron";
import { prisma } from "@/lib/prisma";
import { fetchAndStoreAllBinanceRates } from "./rateService";

cron.schedule("*/2 * * * *", async () => {
  console.log(
    "Running Binance rate fetch and store cron job:",
    new Date().toLocaleTimeString()
  );
  await fetchAndStoreAllBinanceRates();
});

/**
 * Cleanup job to remove expired rates from the database.
 * This job runs every minute to ensure that expired rates are removed promptly.
 */
export async function cleanupExpiredRates(): Promise<void> {
  try {
    const deletedCount = await prisma.fiatCryptoRate.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
    console.log(`Cleaned up ${deletedCount} expired rates.`);
  } catch (error) {
    console.error("Error cleaning up expired rates:", error);
    process.exit(1);
  }
}

export function scheduleRateCleanup(): ScheduledTask {
  const task = cron.schedule(
    "* * * * *",
    async () => {
      try {
        const deletedCount = await prisma.fiatCryptoRate.deleteMany({
          where: {
            expiresAt: {
              lte: new Date(),
            },
          },
        });
        console.log(`Cleaned up ${deletedCount} expired rates.`);
      } catch (error) {
        console.error("Error cleaning up expired rates:", error);
        process.exit(1);
      }
    },
    {
      timezone: "UTC",
    }
  );

  return task;
}
