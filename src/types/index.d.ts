import {
  KenyaPaymentMethod,
  UgandaPaymentMethod,
  EthiopiaPaymentMethod,
  UnitedStatesPaymentMethod,
} from "@prisma/client";

export type TPaymentMethod =
  | UnitedStatesPaymentMethod
  | EthiopiaPaymentMethod
  | KenyaPaymentMethod
  | UgandaPaymentMethod;

export interface BasePaymentAccount {
  id: string;
  userId: string;
  isDefault: boolean;
  currency?: FiatCurrency;
}
