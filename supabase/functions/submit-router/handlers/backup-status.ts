/**
 * Handler: backup status submission
 * Batch upsert – single query for all backup rows + single insert for alerts.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

interface BackupEntry {
  backup_type: string;
  backup_tool: string;
  status: string;
  is_enabled: boolean;
  is_scheduled: boolean;
  last_backup_at?: string;
  next_scheduled_at?: string;
  backup_target?: string;
  backup_size_gb?: number;
  error_message?: string;
  details?: Record<string, unknown>;
}

interface BackupRow {
  agent_id: string;
  tenant_id: string;
  backup_type: string;
  backup_tool: string | null;
  status: string;
  is_enabled: boolean;
  is_scheduled: boolean;
  last_backup_at: string | null;
  next_scheduled_at: string | null;
  last_check_at: string;
  backup_target: string | null;
  backup_size_gb: number | null;
  backup_age_hours: number | null;
  error_message: string | null;
  details: Record<string, unknown>;
  collected_at: string;
  updated_at: string;
}

function computeBackupAge(lastBackupAt?: string): number | null {
  if (!lastBackupAt) return null;
  const lastBackup = new Date(lastBackupAt);
  return Math.round((Date.now() - lastBackup.getTime()) / (1000 * 60 * 60) * 10) / 10;
}

function computeStatus(backup: BackupEntry, ageHours: number | null): string {
  if (ageHours !== null) {
    if (ageHours > 72) return 'critical';
    if (ageHours > 24) return 'warning';
    return 'ok';
  }
  if (!backup.is_enabled) return 'not_configured';
  return backup.status || 'unknown';
}

export async function handleBackupStatus(
  supabase: SupabaseClient,
  agentId: string,
  _agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const { backups } = body as { backups: BackupEntry[] };

  if (!Array.isArray(backups)) {
    return new Response(JSON.stringify({ error: 'Missing backups array' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();

  // --- Phase 1: Build all rows in memory (zero I/O) ---
  const rows: BackupRow[] = [];
  const alertRows: Array<{
    tenant_id: string; agent_id: string;
    severity: string; category: string;
    title: string; message: string; acknowledged: boolean;
  }> = [];

  for (const backup of backups) {
    const backupAgeHours = computeBackupAge(backup.last_backup_at);
    const status = computeStatus(backup, backupAgeHours);

    rows.push({
      agent_id: agentId, tenant_id: tenantId,
      backup_type: backup.backup_type || 'unknown',
      backup_tool: backup.backup_tool || null,
      status,
      is_enabled: backup.is_enabled ?? false,
      is_scheduled: backup.is_scheduled ?? false,
      last_backup_at: backup.last_backup_at || null,
      next_scheduled_at: backup.next_scheduled_at || null,
      last_check_at: now,
      backup_target: backup.backup_target || null,
      backup_size_gb: backup.backup_size_gb || null,
      backup_age_hours: backupAgeHours,
      error_message: backup.error_message || null,
      details: backup.details || {},
      collected_at: now, updated_at: now,
    });

    if (status === 'critical' || status === 'not_configured') {
      const alertMessage = status === 'critical'
        ? `Backup atrasado: ${backup.backup_tool || backup.backup_type} - ultimo backup ha ${backupAgeHours}h`
        : `Backup nao configurado: ${backup.backup_tool || backup.backup_type}`;

      alertRows.push({
        tenant_id: tenantId, agent_id: agentId,
        severity: status === 'critical' ? 'high' : 'medium',
        category: 'backup', title: 'Alerta de Backup',
        message: alertMessage, acknowledged: false,
      });
    }
  }

  // --- Phase 2: Single batch upsert + single batch insert (max 2 queries) ---
  const { error: upsertError } = await supabase
    .from('backup_status')
    .upsert(rows, { onConflict: 'agent_id,backup_type,backup_tool' });

  const upsertedCount = upsertError ? 0 : rows.length;
  if (upsertError) {
    logger.error(`[${requestId}] Batch upsert error:`, upsertError);
  }

  let alertsCreated = 0;
  if (alertRows.length > 0) {
    const { error: alertError } = await supabase
      .from('system_alerts')
      .insert(alertRows);

    alertsCreated = alertError ? 0 : alertRows.length;
    if (alertError) {
      logger.error(`[${requestId}] Batch alert insert error:`, alertError);
    }
  }

  logger.info(`[${requestId}] Backup status updated: ${upsertedCount} records, ${alertsCreated} alerts`);
  return { success: true, upserted: upsertedCount, alerts_created: alertsCreated };
}
