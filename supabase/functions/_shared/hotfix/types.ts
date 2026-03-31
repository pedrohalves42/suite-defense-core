export interface WindowsScriptHotfixResult {
  content: string;
  changed: boolean;
  reasons: string[];
}

export interface HotfixContext {
  content: string;
  reasons: string[];
}

/** Apply a hotfix function and collect reasons */
export function applyHotfix(
  ctx: HotfixContext,
  fn: (ctx: HotfixContext) => void
): void {
  fn(ctx);
}
