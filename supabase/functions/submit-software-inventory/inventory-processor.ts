/**
 * Software inventory deduplication, sanitization, and persistence
 * Extracted from submit-software-inventory/index.ts
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

export interface SoftwareItem {
  name: string;
  version?: string | null;
  vendor?: string | null;
  install_location?: string | null;
  risk_level?: 'unknown' | 'low' | 'medium' | 'high' | 'critical';
}

export function sanitizeString(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    let s = String(input);
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/g, '');
    s = s.replace(/\\u(?![0-9a-fA-F]{4})/g, '');
    s = s.replace(/\\(?=u[^0-9a-fA-F])/g, '');
    try { s = s.normalize('NFC'); } catch { /* ignore */ }
    s = s.trim().slice(0, 1000);
    return s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

export function deduplicateInventory(items: SoftwareItem[]): SoftwareItem[] {
  const uniqueMap = new Map<string, SoftwareItem>();

  for (const item of items) {
    if (!item.name) continue;
    const normalizedName = item.name.trim();
    if (!normalizedName) continue;

    const normalizedVersion = (item.version || '').trim() || null;
    const key = `${normalizedName}|${normalizedVersion || 'null'}`;

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        name: normalizedName,
        version: normalizedVersion,
        vendor: item.vendor || null,
        install_location: item.install_location || null,
        risk_level: item.risk_level || 'unknown',
      });
    }
  }

  return Array.from(uniqueMap.values());
}

export async function persistInventory(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string,
  uniqueItems: SoftwareItem[],
): Promise<{ success: boolean; count: number }> {
  // Clear old inventory
  const { error: deleteError } = await supabase
    .from('software_inventory')
    .delete()
    .eq('agent_id', agentId);

  if (deleteError) {
    logger.error('Failed to clear old inventory', deleteError);
  }

  const itemsToInsert = uniqueItems.map(item => ({
    tenant_id: tenantId,
    agent_id: agentId,
    name: sanitizeString(item.name) || 'Unknown',
    version: sanitizeString(item.version),
    vendor: sanitizeString(item.vendor),
    install_location: sanitizeString(item.install_location),
    risk_level: item.risk_level,
  }));

  const { error: insertError } = await supabase
    .from('software_inventory')
    .upsert(itemsToInsert, {
      onConflict: 'agent_id,name,version',
      ignoreDuplicates: false,
    });

  if (insertError) {
    logger.error('Failed to upsert software inventory', insertError);
    return { success: false, count: 0 };
  }

  return { success: true, count: uniqueItems.length };
}
