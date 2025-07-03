import { nanoid } from "nanoid";

/**
 * Generates a correlation ID with optional prefix
 * @param prefix - Optional prefix for human readability 
 * @returns Formatted correlation ID (e.g., "reg_AbCdEf123")
 */
export const corrNanoid = (prefix?: string): string => {
  const id = nanoid(12);
  return prefix ? `${prefix}_${id}` : id;
};
