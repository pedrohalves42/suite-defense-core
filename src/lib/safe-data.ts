/**
 * Utility to safely map over an array, preventing "is not a function" errors.
 * Returns null if the data is not an array or is empty.
 */
export function safeMap<T, R>(
  data: T[] | undefined | null,
  renderItem: (item: T, index: number) => R,
  fallback: any = []
): R[] {
  // V-FIX: Ensure we always return an array to avoid breaking UI components expecting an array
  if (!data || !Array.isArray(data)) {
    return Array.isArray(fallback) ? fallback : [];
  }
  return data.map(renderItem);
}

/**
 * Safely access nested properties in a potentially null object
 */
export function safeGet<T, K extends keyof T>(obj: T | null | undefined, key: K, fallback: T[K]): T[K] {
  if (obj === null || obj === undefined) return fallback;
  const value = obj[key];
  return (value === undefined || value === null) ? fallback : value;
}

/**
 * Safely parse JSON with fallback
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely convert to number
 */
export function safeNumber(value: any, fallback: number = 0): number {
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}
