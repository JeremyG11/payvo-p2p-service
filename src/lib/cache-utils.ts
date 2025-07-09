import { redis } from "@/config/radis";

export const getRolesAndPermissionsFromCache = async () => {
  try {
    const rolesPermissionsData = await redis().get("app:roles_permissions");

    if (rolesPermissionsData) {
      const parsedData = JSON.parse(rolesPermissionsData.toString());
      return parsedData;
    }

    return null;
  } catch (error) {
    console.error("Error fetching roles and permissions from Redis:", error);
    return null;
  }
};
