import { hashCacheService } from '@/config/radis';

export const getAllActiveUsers = async (): Promise<Record<string, string>> => {
  const allUsers = await hashCacheService.getAllFields<string>(
    'chat:active:users'
  );
  return Object.entries(allUsers)
    .filter(([_, socketId]) => !!socketId)
    .reduce((acc, [userId, socketId]) => {
      acc[userId] = socketId!;
      return acc;
    }, {} as Record<string, string>);
};
