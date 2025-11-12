import { customAlphabet } from 'nanoid';

// Create a custom alphabet that only includes numbers (0-9)
const numericNanoid = customAlphabet('0123456789', 16);

/**
 * Generates a unique numeric ID using nanoid with only numbers
 * @returns A promise that resolves to a unique numeric string
 */
export async function generateAdId(): Promise<string> {
  return numericNanoid();
}

/**
 * Generates a shorter numeric ID (optional, for different use cases)
 * @param length - The length of the ID (default: 12)
 */
export async function generateNumericId(length: number = 12): Promise<string> {
  const customNanoid = customAlphabet('0123456789', length);
  return customNanoid();
}
