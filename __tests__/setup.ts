import { vi, afterEach } from "vitest";
import { NextFunction, Request, Response } from "express";

vi.mock("@/middlewares/authenticate", () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    req.userId = "test-user";
    next();
  },
}));

vi.mock("@/middlewares/authorize", () => ({
  authorize: () => (req: Request, res: Response, next: NextFunction) => next(),
}));

vi.mock("@/middlewares/validator", () => ({
  default: () => (req: Request, res: Response, next: NextFunction) => next(),
}));

/**
 * Core Mock Functions (Prisma)
 * These mock functions replace the actual methods on the Prisma client.
 * They are tracked by vi.fn() for assertion purposes in unit tests.
 */
const mockFindMany = vi.fn();
const mockUpdateMany = vi.fn();
const mockDeleteMany = vi.fn();
const mockUpsert = vi.fn();
const mockCount = vi.fn();
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockDisconnect = vi.fn();
const mockConnect = vi.fn();
const mockOrderCreate = vi.fn();
const mockTransaction = vi.fn();

// Sample Ads for testing
const expiredAd = {
  id: "expired-1",
  status: "ACTIVE",
  unitPrice: 500,
  minLimitFiat: 50,
  maxLimitFiat: 500,
  expiresAt: new Date(Date.now() - 1000),
  paymentTimeout: new Date(Date.now() - 1000),
  agentId: "agent-1",
  acceptedPaymentMethods: [{ paymentMethod: { id: "pm-1", details: {} } }],
};

const activeAd = {
  id: "active-1",
  status: "ACTIVE",
  unitPrice: 600,
  minLimitFiat: 50,
  maxLimitFiat: 500,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  paymentTimeout: new Date(Date.now() + 1000 * 60 * 30),
  agentId: "agent-2",
  acceptedPaymentMethods: [{ paymentMethod: { id: "pm-1", details: {} } }],
};

/**
 * Mock Prisma Client Setup
 * Mocks the PrismaClient constructor and its methods to return the mock functions defined above.
 * The $transaction mock is implemented to immediately execute the callback,
 * simulating a successful transaction and providing the mocked client to the callback.
 */
vi.mock("@prisma/client", async () => {
  const actual = await vi.importActual<typeof import("@prisma/client")>(
    "@prisma/client"
  );

  return {
    ...actual,
    PrismaClient: vi.fn().mockImplementation(() => {
      const client = {
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
        order: {
          create: mockOrderCreate,
          findUnique: mockFindUnique,
          findMany: mockFindMany,
          updateMany: mockUpdateMany,
          deleteMany: mockDeleteMany,
        },

        $transaction: mockTransaction,
        $disconnect: mockDisconnect,
        $connect: mockConnect,
      };

      // Make $transaction behave like real Prisma: execute the callback immediately
      mockTransaction.mockImplementation(
        async (cb: (tx: typeof client) => unknown) => cb(client)
      );

      return client;
    }),
  };
});

/**
 * Expose Mocks Globally
 * This makes all individual mock functions available for direct manipulation and
 * assertion within individual test files using `globalThis.__prismaMocks`.
 */
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
  mockOrderCreate,
  mockTransaction,
  activeAd,
  expiredAd,
};

//- Default behaviors-
mockFindMany.mockResolvedValue([expiredAd, { ...expiredAd, id: "expired-2" }]);

mockUpdateMany.mockImplementation(async ({ where, data }: any) => {
  const ads = [expiredAd, activeAd];
  const updatedAds = ads.filter((a) => where?.id?.in?.includes(a.id));
  updatedAds.forEach((ad) => (ad.status = data?.status ?? ad.status));
  return { count: updatedAds.length };
});

mockUpsert.mockImplementation(async ({ where, update, create }: any) => {
  return { ...update, id: where?.id ?? "new-id" };
});

mockCreate.mockImplementation(async ({ data }: any) => data);

mockOrderCreate.mockImplementation(async ({ data }: any) => ({
  ...data,
  id: "order-1",
  createdAt: new Date(),
  updatedAt: new Date(),
}));

/**
 * Mock Axios Client Setup
 * Mocks the 'axios' default export's post method to return canned, successful data.
 * This prevents unit tests from making real HTTP requests.
 */
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

/**
 * Mock Decimal.js Passthrough
 * Ensures that the 'decimal.js' library is used correctly during testing without mocking.
 */
vi.mock("decimal.js", async () => {
  const actual = await vi.importActual("decimal.js");
  return actual;
});

/**
 * Resets the mock history (call counts, arguments) for all Prisma mock functions
 * after each test run. This ensures test isolation.
 */
afterEach(() => {
  vi.clearAllMocks();
});

/**
 * Manually resets the mock implementations for all Prisma functions.
 * This is useful if a specific test sets a custom implementation and needs to
 * revert to the default behavior for subsequent tests.
 */
export function resetPrismaMocks() {
  mockFindMany.mockReset();
  mockUpdateMany.mockReset();
  mockDeleteMany.mockReset();
  mockUpsert.mockReset();
  mockCount.mockReset();
  mockFindUnique.mockReset();
  mockDisconnect.mockReset();
  mockConnect.mockReset();
  mockCreate.mockReset();
  mockOrderCreate.mockReset();
  mockTransaction.mockReset();
}
