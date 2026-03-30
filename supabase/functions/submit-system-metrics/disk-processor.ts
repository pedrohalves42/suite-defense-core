/**
 * Multi-disk metrics processing and primary disk selection.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

export interface DiskInfo {
  drive_letter: string;
  drive_label?: string;
  drive_type?: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  usage_percent: number;
  is_system_drive?: boolean;
}

interface PrimaryDisk {
  total_gb?: number;
  used_gb?: number;
  free_gb?: number;
  usage_percent?: number;
}

/** Select the most critical disk from array or fallback to legacy values */
export function selectPrimaryDisk(
  disks: DiskInfo[] | undefined,
  legacyTotal?: number,
  legacyUsed?: number,
  legacyFree?: number,
  legacyUsagePercent?: number,
): PrimaryDisk {
  if (disks && disks.length > 0) {
    const critical = disks.reduce((prev, curr) =>
      (curr.usage_percent > (prev.usage_percent || 0)) ? curr : prev,
    );
    logger.debug('Multiple disks detected, using critical disk', {
      critical_drive: critical.drive_letter,
      usage_percent: critical.usage_percent,
      total_disks: disks.length,
    });
    return {
      total_gb: critical.total_gb,
      used_gb: critical.used_gb,
      free_gb: critical.free_gb,
      usage_percent: critical.usage_percent,
    };
  }

  return {
    total_gb: legacyTotal,
    used_gb: legacyUsed,
    free_gb: legacyFree,
    usage_percent: legacyUsagePercent,
  };
}

/** Insert individual disk metrics into dedicated table */
export async function insertDiskMetrics(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string,
  disks: DiskInfo[],
): Promise<void> {
  if (!disks || disks.length === 0) return;

  const diskRecords = disks.map((disk) => ({
    agent_id: agentId,
    tenant_id: tenantId,
    drive_letter: disk.drive_letter,
    drive_label: disk.drive_label || null,
    drive_type: disk.drive_type || 'Fixed',
    total_gb: disk.total_gb,
    used_gb: disk.used_gb,
    free_gb: disk.free_gb,
    usage_percent: disk.usage_percent,
    is_system_drive: disk.is_system_drive || false,
  }));

  const { error: diskError } = await supabase.from('agent_disk_metrics').insert(diskRecords);

  if (diskError) {
    logger.warn('Failed to insert disk metrics', diskError);
  } else {
    logger.debug(`Inserted ${diskRecords.length} disk metrics`);
  }
}
