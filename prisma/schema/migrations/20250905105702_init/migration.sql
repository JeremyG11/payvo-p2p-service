-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'AGENT', 'USER');

-- CreateEnum
CREATE TYPE "public"."UserKycStatus" AS ENUM ('PENDING', 'INCOMPLETE', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_MORE_INFO', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."Source" AS ENUM ('BINANCE', 'OKX');

-- CreateEnum
CREATE TYPE "public"."FiatCurrency" AS ENUM ('USD', 'KES', 'ETB', 'UGX', 'SSP');

-- CreateEnum
CREATE TYPE "public"."CryptoCurrency" AS ENUM ('USDT');

-- CreateEnum
CREATE TYPE "public"."AdType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "public"."UnitedStatesPaymentMethod" AS ENUM ('BANK');

-- CreateEnum
CREATE TYPE "public"."KenyaPaymentMethod" AS ENUM ('MPesaKenya');

-- CreateEnum
CREATE TYPE "public"."EthiopiaPaymentMethod" AS ENUM ('CBE', 'TeleBirr');

-- CreateEnum
CREATE TYPE "public"."UgandaPaymentMethod" AS ENUM ('MoMoNew');

-- CreateEnum
CREATE TYPE "public"."PaymentMethodCategory" AS ENUM ('MOBILE_MONEY', 'BANK_TRANSFER', 'CASH');

-- CreateEnum
CREATE TYPE "public"."KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('PENDING_AGENT_CONFIRMATION', 'AGENT_ACCEPTED', 'AGENT_REJECTED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "public"."AdStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PAUSED', 'EXPIRED', 'DELETED');

-- CreateTable
CREATE TABLE "public"."AdsOnPaymentMethods" (
    "adId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,

    CONSTRAINT "AdsOnPaymentMethods_pkey" PRIMARY KEY ("adId","paymentMethodId")
);

-- CreateTable
CREATE TABLE "public"."Ad" (
    "id" TEXT NOT NULL,
    "advNo" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "fiatCryptoRateId" TEXT NOT NULL,
    "title" TEXT,
    "terms" TEXT,
    "status" "public"."AdStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentRate" DECIMAL(36,18) NOT NULL,
    "availableAmount" DECIMAL(36,18) NOT NULL,
    "minLimitFiat" DECIMAL(18,2) NOT NULL,
    "maxLimitFiat" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."balances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" "public"."FiatCurrency" NOT NULL,
    "available" DECIMAL(65,30) NOT NULL,
    "locked" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "fiatAmount" DECIMAL(18,2) NOT NULL,
    "cryptoAmount" DECIMAL(36,18) NOT NULL,
    "unitPrice" DECIMAL(18,8) NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'PENDING_AGENT_CONFIRMATION',
    "statusHistory" JSONB[],
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupportedPaymentMethod" (
    "id" TEXT NOT NULL,
    "category" "public"."PaymentMethodCategory" NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "currency" "public"."FiatCurrency" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportedPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserPaymentMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supportedPaymentMethodId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Dispute" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "agentId" TEXT,
    "initiatedByUserId" TEXT NOT NULL,
    "resolvedByAdminId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pricing_configs" (
    "id" TEXT NOT NULL,
    "corridor" TEXT NOT NULL,
    "adType" "public"."AdType" NOT NULL,
    "margin" DECIMAL(65,30) NOT NULL,
    "minMargin" DECIMAL(65,30),
    "maxMargin" DECIMAL(65,30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fiat_crypto_rates" (
    "id" TEXT NOT NULL,
    "corridor" TEXT NOT NULL,
    "cryptoAsset" "public"."CryptoCurrency" NOT NULL,
    "fiatAsset" "public"."FiatCurrency" NOT NULL,
    "adType" "public"."AdType" NOT NULL,
    "source" "public"."Source" NOT NULL DEFAULT 'BINANCE',
    "rate" DECIMAL(65,30) NOT NULL,
    "minVolumeThresholdUsed" DECIMAL(65,30) NOT NULL,
    "adsUsedCount" INTEGER NOT NULL,
    "finalClientPrice" DECIMAL(65,30) NOT NULL,
    "marginApplied" DECIMAL(65,30),
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiat_crypto_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."binance_ads" (
    "id" TEXT NOT NULL,
    "advNo" TEXT NOT NULL,
    "tradeType" "public"."AdType" NOT NULL,
    "asset" "public"."CryptoCurrency" NOT NULL,
    "fiatCurrency" "public"."FiatCurrency" NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "minSingleTransAmount" DECIMAL(18,2) NOT NULL,
    "maxSingleTransAmount" DECIMAL(18,2) NOT NULL,
    "tradableQuantity" DECIMAL(36,18) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "binance_ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mpesa_kenya" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "accountName" TEXT,
    "currency" "public"."FiatCurrency" NOT NULL DEFAULT 'KES',
    "displayName" TEXT DEFAULT 'M-Pesa Kenya',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mpesa_kenya_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cbe" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "displayName" TEXT DEFAULT 'Commercial Bank of Ethiopia',
    "currency" "public"."FiatCurrency" NOT NULL DEFAULT 'ETB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cbe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."telebirr" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "accountName" TEXT,
    "currency" "public"."FiatCurrency" NOT NULL DEFAULT 'ETB',
    "displayName" TEXT DEFAULT 'Tele Birr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telebirr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "completedOrders" INTEGER NOT NULL DEFAULT 0,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0.0,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "completedOrders" INTEGER NOT NULL DEFAULT 0,
    "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0.0,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ad_advNo_key" ON "public"."Ad"("advNo");

-- CreateIndex
CREATE INDEX "Ad_agentId_status_idx" ON "public"."Ad"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "balances_userId_currency_key" ON "public"."balances"("userId", "currency");

-- CreateIndex
CREATE INDEX "Order_customerId_status_idx" ON "public"."Order"("customerId", "status");

-- CreateIndex
CREATE INDEX "Order_agentId_status_idx" ON "public"."Order"("agentId", "status");

-- CreateIndex
CREATE INDEX "SupportedPaymentMethod_category_idx" ON "public"."SupportedPaymentMethod"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SupportedPaymentMethod_provider_currency_key" ON "public"."SupportedPaymentMethod"("provider", "currency");

-- CreateIndex
CREATE INDEX "UserPaymentMethod_userId_idx" ON "public"."UserPaymentMethod"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_orderId_key" ON "public"."Dispute"("orderId");

-- CreateIndex
CREATE INDEX "Dispute_orderId_idx" ON "public"."Dispute"("orderId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "public"."Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_initiatedByUserId_idx" ON "public"."Dispute"("initiatedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_configs_corridor_adType_key" ON "public"."pricing_configs"("corridor", "adType");

-- CreateIndex
CREATE UNIQUE INDEX "fiat_crypto_rates_corridor_adType_key" ON "public"."fiat_crypto_rates"("corridor", "adType");

-- CreateIndex
CREATE UNIQUE INDEX "binance_ads_advNo_key" ON "public"."binance_ads"("advNo");

-- CreateIndex
CREATE INDEX "binance_ads_advNo_idx" ON "public"."binance_ads"("advNo");

-- CreateIndex
CREATE INDEX "binance_ads_tradeType_idx" ON "public"."binance_ads"("tradeType");

-- CreateIndex
CREATE INDEX "binance_ads_asset_idx" ON "public"."binance_ads"("asset");

-- CreateIndex
CREATE INDEX "binance_ads_fiatCurrency_idx" ON "public"."binance_ads"("fiatCurrency");

-- CreateIndex
CREATE INDEX "binance_ads_fetchedAt_idx" ON "public"."binance_ads"("fetchedAt");

-- CreateIndex
CREATE INDEX "binance_ads_expiresAt_idx" ON "public"."binance_ads"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "mpesa_kenya_phoneNumber_key" ON "public"."mpesa_kenya"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "cbe_accountNumber_key" ON "public"."cbe"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "telebirr_phoneNumber_key" ON "public"."telebirr"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "public"."Customer"("userId");

-- CreateIndex
CREATE INDEX "Customer_userId_idx" ON "public"."Customer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_userId_key" ON "public"."Agent"("userId");

-- CreateIndex
CREATE INDEX "Agent_userId_idx" ON "public"."Agent"("userId");

-- AddForeignKey
ALTER TABLE "public"."AdsOnPaymentMethods" ADD CONSTRAINT "AdsOnPaymentMethods_adId_fkey" FOREIGN KEY ("adId") REFERENCES "public"."Ad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdsOnPaymentMethods" ADD CONSTRAINT "AdsOnPaymentMethods_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "public"."UserPaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ad" ADD CONSTRAINT "Ad_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ad" ADD CONSTRAINT "Ad_fiatCryptoRateId_fkey" FOREIGN KEY ("fiatCryptoRateId") REFERENCES "public"."fiat_crypto_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balances" ADD CONSTRAINT "balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_adId_fkey" FOREIGN KEY ("adId") REFERENCES "public"."Ad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "public"."UserPaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPaymentMethod" ADD CONSTRAINT "UserPaymentMethod_supportedPaymentMethodId_fkey" FOREIGN KEY ("supportedPaymentMethodId") REFERENCES "public"."SupportedPaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Dispute" ADD CONSTRAINT "Dispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Dispute" ADD CONSTRAINT "Dispute_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Dispute" ADD CONSTRAINT "Dispute_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mpesa_kenya" ADD CONSTRAINT "mpesa_kenya_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."UserPaymentMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cbe" ADD CONSTRAINT "cbe_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."UserPaymentMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."telebirr" ADD CONSTRAINT "telebirr_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."UserPaymentMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
