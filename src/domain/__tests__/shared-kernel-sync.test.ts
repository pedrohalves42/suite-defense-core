/**
 * Validates that shared-kernel enums stay in sync between
 * the Vite frontend and Deno Edge Functions.
 *
 * If this test fails, run: npx tsx scripts/sync-shared-types.ts
 */
import { describe, it, expect } from 'vitest';
import { Platform, UpdateChannel, UpdateStatus } from '@/domain/shared-kernel/shared-enums';

// We can't import Deno types directly, so we read the file and check enum values
import * as fs from 'fs';
import * as path from 'path';

function extractEnumValues(content: string, enumName: string): string[] {
  const regex = new RegExp(`enum ${enumName}\\s*\\{([^}]+)\\}`, 's');
  const match = content.match(regex);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((line) => line.trim())
    .filter((line) => line.includes('='))
    .map((line) => {
      const val = line.split('=')[1].trim().replace(/['"]/g, '').replace(/,$/, '');
      return val;
    });
}

describe('Shared Kernel Sync', () => {
  const denoTypesPath = path.resolve(__dirname, '../../supabase/functions/_shared/hexagonal/types.ts');
  
  it('hexagonal types.ts file exists', () => {
    expect(fs.existsSync(denoTypesPath)).toBe(true);
  });

  it('Platform enum values match', () => {
    const denoContent = fs.readFileSync(denoTypesPath, 'utf-8');
    const denoValues = extractEnumValues(denoContent, 'Platform');
    const frontendValues = Object.values(Platform);
    expect(denoValues).toEqual(frontendValues);
  });

  it('UpdateChannel enum values match', () => {
    const denoContent = fs.readFileSync(denoTypesPath, 'utf-8');
    const denoValues = extractEnumValues(denoContent, 'UpdateChannel');
    const frontendValues = Object.values(UpdateChannel);
    expect(denoValues).toEqual(frontendValues);
  });

  it('UpdateStatus enum values match', () => {
    const denoContent = fs.readFileSync(denoTypesPath, 'utf-8');
    const denoValues = extractEnumValues(denoContent, 'UpdateStatus');
    const frontendValues = Object.values(UpdateStatus);
    expect(denoValues).toEqual(frontendValues);
  });
});
