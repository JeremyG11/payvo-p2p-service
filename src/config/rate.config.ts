import {
  FiatCurrency,
  PaymentMethodCategory,
  PaymentMethodProvider,
} from "@prisma/client";

interface PaymentMethodConfig {
  provider: PaymentMethodProvider;
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
        provider: "BANK",
        displayName: "Bank",
        category: PaymentMethodCategory.BANK_TRANSFER,
      },
      {
        provider: "CASH",
        displayName: "Cash",
        category: PaymentMethodCategory.CASH,
      },
    ],
  },
  {
    fiatCurrency: FiatCurrency.KES,
    paymentMethods: [
      {
        provider: PaymentMethodProvider.MPESA_KENYA,
        displayName: "M-Pesa Kenya",
        category: PaymentMethodCategory.MOBILE_MONEY,
      },
      {
        provider: "BANK",
        displayName: "Bank",
        category: PaymentMethodCategory.BANK_TRANSFER,
      },
    ],
  },
  {
    fiatCurrency: FiatCurrency.ETB,
    paymentMethods: [
      {
        provider: PaymentMethodProvider.TELE_BIRR,
        displayName: "Tele Birr",
        category: PaymentMethodCategory.MOBILE_MONEY,
      },
      {
        provider: PaymentMethodProvider.CBE,
        displayName: "Commercial Bank of Ethiopia",
        category: PaymentMethodCategory.BANK_TRANSFER,
      },
    ],
  },
  {
    fiatCurrency: FiatCurrency.UGX,
    paymentMethods: [
      {
        provider: PaymentMethodProvider.MTN_MOMO_UGANDA,
        displayName: "MTN MoMo Uganda",
        category: PaymentMethodCategory.MOBILE_MONEY,
      },
      {
        provider: PaymentMethodProvider.BANK,
        displayName: "Bank",
        category: PaymentMethodCategory.BANK_TRANSFER,
      },
    ],
  },
];
