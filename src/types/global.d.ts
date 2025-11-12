import { vi } from 'vitest';

declare global {
  var __prismaMocks: {
    mockFindMany: any;
    mockUpdateMany: any;
    mockDeleteMany: any;
    mockUpsert: any;
    mockCount: any;
  };
}
