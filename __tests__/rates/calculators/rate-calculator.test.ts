import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { RawAdRate } from "@/types/interface";
import { RateCalculator } from "@/services/rates/calculation/rate-calculator";

describe("RateCalculator", () => {
  const calculator = new RateCalculator();

  const sampleAds: RawAdRate[] = [
    {
      rawRate: new Decimal(100),
      volumeAvailable: new Decimal(10),
      maxLimit: null,
    },
    {
      rawRate: new Decimal(102),
      volumeAvailable: new Decimal(20),
      maxLimit: null,
    },
    {
      rawRate: new Decimal(98),
      volumeAvailable: new Decimal(5),
      maxLimit: null,
    },
  ];

  it("calculates volume-weighted rate correctly", () => {
    const vwRate = calculator.calculateVolumeWeightedRate(sampleAds);
    expect(vwRate.toNumber()).toBeCloseTo(100.6667, 4);
  });

  it("filters ads by deviation correctly", () => {
    const filtered = calculator.filterAdsByDeviation([
      {
        rawRate: new Decimal(100),
        volumeAvailable: new Decimal(1),
        maxLimit: null,
      },
      {
        rawRate: new Decimal(200),
        volumeAvailable: new Decimal(1),
        maxLimit: null,
      },
    ]);

    expect(filtered.length).toBe(1);
    expect(filtered[0].rawRate.toNumber()).toBe(100);
  });
});
