import { create } from "axios";
import { vi } from "vitest";

const mockFindMany = vi.fn();
const mockUpdateMany = vi.fn();
const mockDeleteMany = vi.fn();
const mockUpsert = vi.fn();
const mockCount = vi.fn();
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockDisconnect = vi.fn();
const mockConnect = vi.fn();

// Sample data for E2E tests
const expiredAd = {
  id: "expired-1",
  status: "ACTIVE",
  rate: 500,
  expiresAt: new Date(Date.now() - 1000), // expired
};

const activeAd = {
  id: "active-1",
  status: "ACTIVE",
  rate: 600,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60), // not expired
};

vi.mock("@prisma/client", async () => {
  const actual = await vi.importActual("@prisma/client");
  return {
    ...actual,
    PrismaClient: vi.fn().mockImplementation(() => ({
      ad: {
        findMany: mockFindMany,
        updateMany: mockUpdateMany,
        deleteMany: mockDeleteMany,
        count: mockCount,
        findUnique: mockFindUnique,
        create: mockCreate,
      },
      binanceP2PAd: {
        upsert: mockUpsert,
        deleteMany: mockDeleteMany,
        findMany: mockFindMany,
        findUnique: mockFindUnique,
        create: mockCreate,
      },

      agent: {
        upsert: mockUpsert,
        findUnique: mockFindUnique,
        create: mockCreate,
        deleteMany: mockDeleteMany,
      },

      $disconnect: mockDisconnect,
      $connect: mockConnect,
    })),
  };
});

(globalThis as any).__prismaMocks = {
  mockFindMany,
  mockUpdateMany,
  mockDeleteMany,
  mockUpsert,
  mockCount,
  mockFindUnique,
  mockDisconnect,
  mockConnect,
  mockCreate,
};

// Default E2E behavior for scheduler tests
mockFindMany.mockImplementation(async () => [
  { ...expiredAd },
  { ...expiredAd, id: "expired-2" },
]);

mockUpdateMany.mockImplementation(async ({ where, data }) => {
  const updatedAds = [];

  // Check each expired ad
  for (const ad of [expiredAd, activeAd]) {
    if (where?.id?.in?.includes(ad.id)) {
      ad.status = data?.status ?? ad.status;
      updatedAds.push(ad);
    }
  }

  return { count: updatedAds.length };
});

mockUpsert.mockImplementation(async ({ where, update, create }) => {
  return { ...update, id: where?.id ?? "new-id" };
});
mockCreate.mockImplementation(async ({ data }) => data);

vi.mock("axios", async () => {
  const actual = await vi.importActual("axios");
  return {
    ...actual,
    default: {
      post: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              adv: {
                advNo: "123",
                price: "500",
                tradableQuantity: "10",
                minSingleTransAmount: "50",
                maxSingleTransAmount: "500",
                tradeMethods: [{ tradeMethodName: "TeleBirr" }],
              },
            },
          ],
        },
      }),
    },
  };
});

vi.mock("decimal.js", async () => {
  const actual = await vi.importActual("decimal.js");
  return actual;
});

import { afterEach } from "vitest";
import { a } from "vitest/dist/chunks/suite.d.FvehnV49.js";
afterEach(() => {
  vi.clearAllMocks();
});

export function resetPrismaMocks() {
  mockFindMany.mockReset();
  mockUpdateMany.mockReset();
  mockDeleteMany.mockReset();
  mockUpsert.mockReset();
  mockCount.mockReset();
  mockCreate.mockReset();
  mockFindUnique.mockReset();
  mockDisconnect.mockReset();
  mockConnect.mockReset();
}
