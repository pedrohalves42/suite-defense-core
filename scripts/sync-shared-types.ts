/**
 * Generates the Deno-compatible hexagonal types from the canonical
 * shared-kernel definitions.
 *
 * Usage: npx tsx scripts/sync-shared-types.ts
 *
 * This script reads `src/domain/shared-kernel/shared-enums.ts` and
 * produces `supabase/functions/_shared/hexagonal/types.ts` with:
 *   - The same enum definitions (verbatim)
 *   - The Deno-only port interfaces & DomainEvent (appended)
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'src/domain/shared-kernel/shared-enums.ts');
const TARGET = path.join(ROOT, 'supabase/functions/_shared/hexagonal/types.ts');

const enumSource = fs.readFileSync(SOURCE, 'utf-8');

// Extract only the enum blocks (skip the doc comment header)
const enumBlocks = enumSource
  .split('\n')
  .filter((line) => {
    // Keep enums, blank lines, comments that aren't the module doc
    if (line.startsWith('/**') || line.startsWith(' *') || line.startsWith(' */')) return false;
    return true;
  })
  .join('\n')
  .trim();

const output = `/**
 * Deno-compatible domain types for the Hexagonal Architecture.
 *
 * ⚠️  AUTO-GENERATED — DO NOT EDIT MANUALLY.
 * Source of truth: src/domain/shared-kernel/shared-enums.ts
 * Regenerate with: npx tsx scripts/sync-shared-types.ts
 */

${enumBlocks}

// ─── Port interfaces (Deno-only) ────────────────────────
export interface CheckForUpdateCommand {
  agentId: string;
  currentVersion: string;
  currentChecksum?: string;
  platform: Platform;
  channel: UpdateChannel;
}

export interface UpdateAvailableResult {
  updateAvailable: boolean;
  packageId?: string;
  targetVersion?: string;
  downloadUrl?: string;
  checksum?: string;
  reason?: 'upgrade' | 'hotfix';
}

export interface ScheduleUpdateCommand {
  agentId: string;
  packageId: string;
}

export interface ScheduleUpdateResult {
  updateId: string;
  status: UpdateStatus;
}

export interface ProcessUpdateStatusCommand {
  updateId: string;
  newStatus: 'downloading' | 'applying' | 'completed' | 'failed';
  errorMessage?: string;
}

export interface ProcessUpdateStatusResult {
  updateId: string;
  previousStatus: string;
  currentStatus: string;
}

// ─── Domain Event ───────────────────────────────────────
export interface DomainEvent {
  readonly eventType: string;
  readonly occurredOn: Date;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
}
`;

fs.writeFileSync(TARGET, output, 'utf-8');
console.log(`✅ Synced types to ${path.relative(ROOT, TARGET)}`);
