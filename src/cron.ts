import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { fetchAndStoreAllBinanceRates } from "./service/rateService";

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
async function cleanupExpiredRates() {
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
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup job every minute
cron.schedule("* * * * *", cleanupExpiredRates);

console.log("Rate cleanup cron job started.");
console.log("Binance rate fetch and store cron job scheduled.");

export default cron;
