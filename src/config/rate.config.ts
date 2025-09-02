import { FiatCurrency, PaymentMethodCategory } from '@prisma/client';

interface PaymentMethodConfig {
  provider: string;
  displayName: string;
  category: PaymentMethodCategory;
}

interface CountryConfig {
  fiatCurrency: FiatCurrency;
  paymentMethods: PaymentMethodConfig[];
}

export const rateConfigs: CountryConfig[] = [
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
