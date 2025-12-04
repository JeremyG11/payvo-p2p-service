import Decimal from 'decimal.js';
import { AdType } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

async function main() {
  const pricingConfigs = [
    {
      corridor: 'USD-ETB',
      adType: AdType.BUY,
      margin: new Decimal(0.015),
      minMargin: new Decimal(0.01),
      maxMargin: new Decimal(0.02),
      isActive: true,
    },
    {
      corridor: 'USD-ETB',
      adType: AdType.SELL,
      margin: new Decimal(0.02),
      minMargin: new Decimal(0.015),
      maxMargin: new Decimal(0.03),
      isActive: true,
    },
    {
      corridor: 'USD-UGX',
      adType: AdType.BUY,
      margin: new Decimal(0.01),
      minMargin: new Decimal(0.005),
      maxMargin: new Decimal(0.015),
      isActive: true,
    },
    {
      corridor: 'USD-UGX',
      adType: AdType.SELL,
      margin: new Decimal(0.012),
      minMargin: new Decimal(0.008),
      maxMargin: new Decimal(0.02),
      isActive: true,
    },

    {
      corridor: 'USD-KES',
      adType: AdType.BUY,
      margin: new Decimal(0.013),
      minMargin: new Decimal(0.01),
      maxMargin: new Decimal(0.02),
      isActive: true,
    },
  ];

  for (const config of pricingConfigs) {
    await prisma.pricingConfig.upsert({
      where: {
        corridor_adType: {
          corridor: config.corridor,
          adType: config.adType,
        },
      },
      update: {
        margin: config.margin,
        minMargin: config.minMargin,
        maxMargin: config.maxMargin,
        isActive: config.isActive,
        updatedAt: new Date(),
      },
      create: {
        ...config,
      },
    });
    console.log(
      `Upserted pricing config for ${config.corridor} ${config.adType}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
