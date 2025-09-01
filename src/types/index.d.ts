import {
  KenyaPaymentMethod,
  UgandaPaymentMethod,
  EthiopiaPaymentMethod,
  UnitedStatesPaymentMethod,
} from "@prisma/client";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

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
