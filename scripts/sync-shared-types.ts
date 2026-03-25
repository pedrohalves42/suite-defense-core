/**
 * Generates the Deno-compatible hexagonal types from the canonical
 * shared-kernel definitions.
 *
 * Usage: npx tsx scripts/sync-shared-types.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'src/domain/shared-kernel/shared-enums.ts');
const TARGET = path.join(ROOT, 'supabase/functions/_shared/hexagonal/types.ts');

const enumSource = fs.readFileSync(SOURCE, 'utf-8');

// Extract only the enum blocks (skip the module-level doc comment)
const lines = enumSource.split('\n');
const enumLines: string[] = [];
let inDocComment = false;
let docCommentDone = false;

for (const line of lines) {
  if (!docCommentDone) {
    if (line.trimStart().startsWith('/**')) { inDocComment = true; continue; }
    if (inDocComment && line.trimStart().startsWith('*/')) { inDocComment = false; docCommentDone = true; continue; }
    if (inDocComment) continue;
    if (line.trim() === '') continue;
    docCommentDone = true;
  }
  enumLines.push(line);
}

const enumBlocks = enumLines.join('\n').trim();

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
console.log(\`✅ Synced types to \${path.relative(ROOT, TARGET)}\`);
