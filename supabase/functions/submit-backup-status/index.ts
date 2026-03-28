/**
 * submit-backup-status: Receives backup monitoring data from agents
 * Migrated to serveAgent middleware
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

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

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, tenantId, requestId, body } = ctx;
  const { backups } = body as { backups: BackupEntry[] };

  if (!Array.isArray(backups)) {
    return new Response(JSON.stringify({ error: 'Missing backups array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();
  let upsertedCount = 0;
  let alertsCreated = 0;

  for (const backup of backups) {
    let backupAgeHours: number | null = null;
    if (backup.last_backup_at) {
      const lastBackup = new Date(backup.last_backup_at);
      backupAgeHours = Math.round((Date.now() - lastBackup.getTime()) / (1000 * 60 * 60) * 10) / 10;
    }

    let computedStatus = backup.status || 'unknown';
    if (backupAgeHours !== null) {
      if (backupAgeHours > 72) computedStatus = 'critical';
      else if (backupAgeHours > 24) computedStatus = 'warning';
      else computedStatus = 'ok';
    } else if (!backup.is_enabled) {
      computedStatus = 'not_configured';
    }

    const record = {
      agent_id: agentId,
      tenant_id: tenantId,
      backup_type: backup.backup_type || 'unknown',
      backup_tool: backup.backup_tool || null,
      status: computedStatus,
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
      collected_at: now,
      updated_at: now,
    };

    const { error: upsertError } = await supabase
      .from('backup_status')
      .upsert(record, { onConflict: 'agent_id,backup_type,backup_tool' });

    if (upsertError) {
      logger.error(`[${requestId}] Upsert error:`, upsertError);
    } else {
      upsertedCount++;
    }

    if (computedStatus === 'critical' || computedStatus === 'not_configured') {
      const alertMessage = computedStatus === 'critical'
        ? `Backup atrasado: ${backup.backup_tool || backup.backup_type} - último backup há ${backupAgeHours}h`
        : `Backup não configurado: ${backup.backup_tool || backup.backup_type}`;

      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          severity: computedStatus === 'critical' ? 'high' : 'medium',
          category: 'backup',
          title: 'Alerta de Backup',
          message: alertMessage,
          acknowledged: false,
        });

      if (!alertError) alertsCreated++;
    }
  }

  logger.info(`[${requestId}] Backup status updated: ${upsertedCount} records, ${alertsCreated} alerts`);
  return { success: true, upserted: upsertedCount, alerts_created: alertsCreated };
});
