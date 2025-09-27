# 📈 Rate Engine Documentation

The **Rate Engine** powers price discovery for the Payvo P2P platform.  
It ensures that ads are always priced competitively against market references (Binance P2P) while enforcing business rules (margins, corridor policies).

---

## 🧩 Architecture Overview

```
BinanceP2P Ads (DB)
        │
        ▼
 ┌─────────────────┐
 │  AdRateFetcher  │  ← queries & normalizes raw market data
 └─────────────────┘
        │
        ▼
 ┌─────────────────┐
 │ RateCalculator  │  ← filters outliers, computes volume-weighted rate
 └─────────────────┘
        │
        ▼
 ┌─────────────────┐
 │ MarginApplier   │  ← applies PricingConfig rules (margin, min/max bounds)
 └─────────────────┘
        │
        ▼
 ┌─────────────────┐
 │  RateService    │  ← orchestrator, caching, corridor conversion
 └─────────────────┘
        │
        ▼
      Ad Creation  ← uses computed `unitPrice`
```

---

## 📦 Components

### 1. **RateCalculator**

- **Purpose**: Pure math layer.
- Functions:
  - `calculateVolumeWeightedRate` → weighted avg. price by available volume.
  - `filterAdsByDeviation` → removes ads deviating >5% from median.

---

### 2. **AdRateFetcher**

- **Purpose**: Find a reliable _base market rate_.
- Workflow:
  1. Try fresh **Binance ads** (last 5 minutes).
  2. Fallback → local Ads DB.
- Normalizes results to `RawAdRate`:
  ```ts
  type RawAdRate = {
    rate: Decimal;
    availableAmount: Decimal;
    minLimit: Decimal;
    maxLimit: Decimal;
  };
  ```

---

### 3. **MarginApplier**

- **Purpose**: Apply business rules.
- Looks up `PricingConfig(corridor, adType)`:
  - `margin` → main adjustment.
  - `minMargin` / `maxMargin` → enforce bounds.
- Example (BUY, margin +2%):
  ```
  Base rate: 57.50
  Final rate: 58.65 (clamped within min/max bounds)
  ```

---

### 4. **RateService**

- **Purpose**: Orchestrator & API layer.
- Responsibilities:
  - `getMarketRate(input)` → compute rate for a fiat/crypto + adType.
  - `calculateCorridorRate(from, to)` → compute cross-fiat rates (via USDT).
  - `_getOrCalculate()` → cache results & provide stale fallback.
- Dependencies:
  - `AdRateFetcher` for base rates.
  - `MarginApplier` for rules.
  - `DecimalAwareCacheService` for caching.
  - `PricingConfigService` for config lookup.

---

## ⚙️ Example Workflow

### BUY Ad Creation (USDT-ETB)

1. Binance ads fetched:
   ```
   price = 57.50 ETB
   ```
2. PricingConfig rule:
   ```
   corridor = USDT-ETB
   adType   = BUY
   margin   = +0.02
   minMargin = +0.01
   maxMargin = +0.05
   ```
3. RateEngine applies margin:

   ```
   57.50 * (1 + 0.02) = 58.65
   ```

   → within bounds ✅  
   → final price = **58.65 ETB**

4. Ad stored in DB:
   ```ts
   await prisma.ad.create({
     data: {
       adType: "BUY",
       fiatCurrency: "ETB",
       unitPrice: 58.65,
       ...
     }
   });
   ```

---

## 📚 Key Tables

### `BinanceP2PAd`

Stores **raw market data** synced from Binance.

| Field     | Type    | Description            |
| --------- | ------- | ---------------------- |
| price     | Decimal | Market rate            |
| expiresAt | Date    | Expiration for cleanup |
| tradeType | Enum    | BUY / SELL             |

---

### `PricingConfig`

Defines **margin rules** per corridor.

| Field     | Type    | Example      |
| --------- | ------- | ------------ |
| corridor  | String  | `USDT-ETB`   |
| adType    | Enum    | `BUY`        |
| margin    | Decimal | `0.02` (+2%) |
| minMargin | Decimal | `0.01` (+1%) |
| maxMargin | Decimal | `0.05` (+5%) |

---

## ✅ Benefits

- Always based on **live market rates**.
- Protects business with **margin boundaries**.
- Provides **caching + stale fallback** for resilience.
- Clean separation of **math, data, business rules, orchestration**.

---

## 🚀 Next Steps

- Add more advanced outlier detection (percentiles).
- Support dynamic corridor weighting.
- Build monitoring (logs/alerts) for stale rates.

---
