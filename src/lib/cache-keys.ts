export enum AppCacheFields {
  RolesPermissions = "roles_permissions",
}
export enum UserCacheFields {
  Session = "session",
  ProfileData = "profile_data",
  AuthData = "auth_data",
}

export const appCacheHashKey = () => `app:data`;
export const userCacheHashKey = (userId: string) => `user:${userId}:data`;
