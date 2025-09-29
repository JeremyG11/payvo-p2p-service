import Decimal from 'decimal.js';
import { prisma } from '@/lib/prisma';
import { AdType, FiatCurrency, CryptoCurrency } from '@prisma/client';
import { PricingConfigService } from '@/services/cache/rate/pricing';
import { logger } from '@/lib/logger';
import { MarginApplier } from '@/services/rates/calculation/margin-applier';

const sampleAgents = [
  { id: 'agent-1', userId: 'test-user-1' },
  { id: 'agent-2', userId: 'test-user-2' },
];

async function seedAds() {
  console.log('--- Starting Ads Seeding ---');

  // Ensure agents exist
  for (const agent of sampleAgents) {
    await prisma.agent.upsert({
      where: { id: agent.id },
      update: {},
      create: agent,
    });
    console.log(`Ensured agent exists: ${agent.id}`);
  }

  // Delete existing system ads
  await prisma.ad.deleteMany();
  console.log('Deleted existing system ads\n');

  // Fetch active pricing corridors
  const corridors = await prisma.pricingConfig.findMany({
    where: { isActive: true },
  });

  if (!corridors.length) {
    console.log('No active corridors found, exiting.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${corridors.length} active corridors.`);

  const pricingService = new PricingConfigService(prisma);
  const marginApplier = new MarginApplier(pricingService, logger);

  for (const agent of sampleAgents) {
    for (const config of corridors) {
      const [from, to] = config.corridor.split('-') as [
        FiatCurrency,
        FiatCurrency
      ];

      console.log(`\nProcessing corridor: ${from}-${to} (${config.adType})`);

      // Fetch Binance P2P ads
      const usdToUsdtAds = await prisma.binanceP2PAd.findMany({
        where: { asset: 'USDT', fiatCurrency: 'USD', tradeType: config.adType },
      });

      const usdtToFiatAds = await prisma.binanceP2PAd.findMany({
        where: { asset: 'USDT', fiatCurrency: to, tradeType: config.adType },
      });

      if (!usdToUsdtAds.length || !usdtToFiatAds.length) {
        console.log(
          `No ads found for ${from}-${to} ${config.adType}, skipping.`
        );
        continue;
      }

      // Pick the best price: lowest for BUY, highest for SELL
      const pickBestPrice = (ads: typeof usdToUsdtAds) =>
        config.adType === AdType.BUY
          ? new Decimal(Math.min(...ads.map((a) => Number(a.price))))
          : new Decimal(Math.max(...ads.map((a) => Number(a.price))));

      const usdToUsdtRate = pickBestPrice(usdToUsdtAds);
      const usdtToFiatRate = pickBestPrice(usdtToFiatAds);

      const baseRate = usdToUsdtRate.times(usdtToFiatRate);
      console.log(`Base corridor rate: ${baseRate.toFixed(8)}`);

      // Apply margin
      const finalRate = await marginApplier.applyMargin(
        baseRate,
        config.adType,
        from,
        'USDT'
      );

      // Compute deviation percent
      const deviationPercent = finalRate.minus(baseRate).dividedBy(baseRate);

      // Use the advNo of the highest volume ad
      const highestVolumeAd = usdtToFiatAds.sort(
        (a, b) => Number(b.tradableQuantity) - Number(a.tradableQuantity)
      )[0];

      await prisma.ad.create({
        data: {
          advNo: highestVolumeAd.advNo + `sys-${Date.now()}`,
          agentId: agent.id,
          adType: config.adType,
          fiatCurrency: from,
          fromCurrency: from,
          toCurrency: to,
          unitPrice: finalRate,
          availableAmount: new Decimal(1000),
          minLimitFiat: new Decimal(10),
          maxLimitFiat: new Decimal(500),
          deviationPercent,
          status: 'ACTIVE',
          title: `${config.adType} ${from}-${to}`,
          terms: 'Standard P2P terms',
        },
      });

      console.log(
        `System ad created for agent ${agent.id} | ${
          config.adType
        } ${from}-${to} | price: ${finalRate.toFixed(8)}`
      );
    }
  }

  console.log('--- Ads seeding completed! ---');
  await prisma.$disconnect();
}

seedAds().catch((err) => {
  console.error(err);
  prisma.$disconnect();
});
