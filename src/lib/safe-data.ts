/**
 * Utility to safely map over an array, preventing "is not a function" errors.
 * Returns null if the data is not an array or is empty.
 */
export function safeMap<T, R>(
  data: T[] | undefined | null,
  renderItem: (item: T, index: number) => R,
  fallback: R | null = null
): R[] | R | null {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return fallback;
  }
  return data.map(renderItem);
}
