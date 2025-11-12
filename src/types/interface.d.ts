/**
 * Input parameters required for rate calculation.
 *
 * @property fiatCurrency - The fiat currency involved in the calculation.
 * @property cryptoCurrency - The cryptocurrency involved in the calculation.
 * @property adType - The type of advertisement (buy/sell).
 */
export interface RateCalculationInput {}

/**
 * Represents a calculated rate with its metadata.
 *
 * @property rate - The calculated rate as a Decimal value.
 * @property source - The source of the rate (e.g., binance, market, fallback, database).
 * @property sourceDetail - Optional details about the rate source.
 * @property calculatedAt - The date and time when the rate was calculated.
 * @property adsConsidered - The number of ads considered in the calculation.
 * @property volumeWeight - The weight of the volume used in the calculation.
 * @property stale - Indicates if the rate is considered stale.
 * @property baseRate - Optional base rate before margin is applied.
 * @property marginApplied - Optional margin applied to the base rate.
 */
export interface ICalculatedRate {}

/**
 * Represents a corridor rate between two fiat currencies, including inbound and outbound rates.
 *
 * @property fromCurrency - The source fiat currency.
 * @property toCurrency - The destination fiat currency.
 * @property rate - The calculated corridor rate as a Decimal value.
 * @property inboundRate - The inbound calculated rate details.
 * @property outboundRate - The outbound calculated rate details.
 * @property margin - The margin applied to the corridor rate.
 * @property expiresAt - The expiration date and time of the corridor rate.
 * @property stale - Indicates if the corridor rate is considered stale.
 * @property calculationMethod - Optional method used for rate calculation.
 */
export interface ICorridorRate {}
export interface RateCalculationInput {
  fiatCurrency: FiatCurrency;
  cryptoCurrency: CryptoCurrency;
  adType: AdType;
}

export interface ICalculatedRate {
  rate: Decimal;
  source: 'binance' | 'market' | 'fallback' | 'database';
  sourceDetail?: string;
  calculatedAt: Date;
  adsConsidered: number;
  volumeWeight: Decimal;
  stale?: boolean;
  baseRate?: Decimal;
  marginApplied?: Decimal;
}

export interface ICorridorRate {
  fromCurrency: FiatCurrency;
  toCurrency: FiatCurrency;
  rate: Decimal;
  inboundRate: ICalculatedRate;
  outboundRate: ICalculatedRate;
  margin: Decimal;
  expiresAt: Date;
  stale?: boolean;
  calculationMethod?: string;
}

export interface RateCalculationInput {
  fiatCurrency: FiatCurrency;
  cryptoCurrency: CryptoCurrency;
  adType: AdType;
}

export type RawAdRate = {
  rawRate: Decimal;
  volumeAvailable: Decimal;
  maxLimit: Decimal | null;
};
