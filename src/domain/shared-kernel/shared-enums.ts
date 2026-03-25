/**
 * Shared Kernel: Canonical enum definitions used by BOTH the frontend (Vite)
 * and backend (Deno Edge Functions).
 *
 * ⚠️  IMPORTANT: When modifying this file, you MUST run `npm run sync:types`
 * to regenerate the Deno-compatible copy at
 * `supabase/functions/_shared/hexagonal/types.ts`.
 *
 * A Vitest sync test (`shared-kernel-sync.test.ts`) verifies that both
 * copies stay in sync — CI will fail if they drift.
 */

// ─── Platform Enums ─────────────────────────────────────
export enum Platform {
  WINDOWS = 'windows',
  LINUX = 'linux',
  MACOS = 'macos',
}

export enum UpdateChannel {
  STABLE = 'stable',
  BETA = 'beta',
  ALPHA = 'alpha',
}

export enum UpdateStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  APPLYING = 'applying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}
