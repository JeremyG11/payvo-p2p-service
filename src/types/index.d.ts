import {
  FiatCurrency,
  UserKycStatus,
  UserRole,
} from '@/generated/prisma/enums';

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
  user: {
    id: string;
    status: UserKycStatus;
    role: UserRole;
    permissions: string[];
  };
}
