import {
  AdType,
  CryptoCurrency,
  FiatCurrency,
  PaymentMethodCategory,
} from '@prisma/client';

interface PaymentMethodConfig {
  provider: string;
  displayName: string;
  category: PaymentMethodCategory;
}

interface CountryConfig {
  fiatCurrency: FiatCurrency;
  paymentMethods: PaymentMethodConfig[];
}

export const PAYMENT_METHODS_CONFIG: CountryConfig[] = [
  {
    fiatCurrency: FiatCurrency.USD,
    paymentMethods: [
      {
        provider: 'ABA',
        displayName: 'Cash',
        category: PaymentMethodCategory.BANK_TRANSFER,
      },
    ],
  },
  {
    fiatCurrency: FiatCurrency.KES,
    paymentMethods: [
      {
        provider: 'MPesaKenya',
        displayName: 'M-Pesa Kenya',
        category: PaymentMethodCategory.MOBILE_MONEY,
      },
      {
        provider: 'BANK',
        displayName: 'Bank',
        category: PaymentMethodCategory.BANK_TRANSFER,
      },
    ],
  },
  {
    fiatCurrency: FiatCurrency.ETB,
    paymentMethods: [
      {
        provider: 'TeleBirr',
        displayName: 'Tele Birr',
        category: PaymentMethodCategory.MOBILE_MONEY,
      },
      {
        provider: 'CBE',
        displayName: 'Commercial Bank of Ethiopia',
        category: PaymentMethodCategory.BANK_TRANSFER,
      },
    ],
  },
  {
    fiatCurrency: FiatCurrency.UGX,
    paymentMethods: [
      {
        provider: 'MoMoNew',
        displayName: 'MTN MoMo Uganda',
        category: PaymentMethodCategory.MOBILE_MONEY,
      },
      {
        provider: 'BANK',
        displayName: 'Bank Transfer',
        category: PaymentMethodCategory.BANK_TRANSFER,
      },
    ],
  },
];

export const PAIRS_TO_FETCH = [
  {
    fiat: FiatCurrency.USD,
    crypto: CryptoCurrency.USDT,
    adType: AdType.BUY,
  },
  {
    fiat: FiatCurrency.KES,
    crypto: CryptoCurrency.USDT,
    adType: AdType.SELL,
  },
  {
    fiat: FiatCurrency.ETB,
    crypto: CryptoCurrency.USDT,
    adType: AdType.SELL,
  },
  {
    fiat: FiatCurrency.UGX,
    crypto: CryptoCurrency.USDT,
    adType: AdType.SELL,
  },
];
