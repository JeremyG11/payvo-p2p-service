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

export interface MobileMoneyPaymentAccount extends BasePaymentAccount {
  phoneNumber: string;
}

export interface CachedAuthData {
  enumRole: string;
  permissions: string[];
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
}
