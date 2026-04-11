/**
 * Handler: software inventory submission (migrated from submit-software-inventory)
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../logger.ts';

interface SoftwareItem {
  name: string;
  version?: string | null;
  vendor?: string | null;
  install_location?: string | null;
  risk_level?: 'unknown' | 'low' | 'medium' | 'high' | 'critical';
}

function sanitizeString(input: string | null | undefined): string | null {
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

function deduplicateInventory(items: SoftwareItem[]): SoftwareItem[] {
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

export async function handleSoftwareInventory(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const { agent_id, items } = body as { agent_id?: string; items?: SoftwareItem[] };

  const effectiveAgentId = agent_id || agentId;

  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, inserted: 0 };
  }

  logger.info(`[${requestId}] Storing ${items.length} software items for agent ${agentName}`);

  const uniqueItems = deduplicateInventory(items);
  logger.info(`[${requestId}] Deduplicated: ${items.length} -> ${uniqueItems.length} unique items`);

  if (uniqueItems.length === 0) {
    return { success: true, inserted: 0, deduplicated_from: items.length };
  }

  // Clear old inventory
  const { error: deleteError } = await supabase
    .from('software_inventory')
    .delete()
    .eq('agent_id', effectiveAgentId);

  if (deleteError) {
    logger.error(`[${requestId}] Failed to clear old inventory`, deleteError);
  }

  const itemsToInsert = uniqueItems.map(item => ({
    tenant_id: tenantId,
    agent_id: effectiveAgentId,
    name: sanitizeString(item.name) || 'Unknown',
    version: sanitizeString(item.version),
    vendor: sanitizeString(item.vendor),
    install_location: sanitizeString(item.install_location),
    risk_level: item.risk_level,
  }));

  const { error: insertError } = await supabase
    .from('software_inventory')
    .upsert(itemsToInsert, { onConflict: 'agent_id,name,version', ignoreDuplicates: false });

  if (insertError) {
    logger.error(`[${requestId}] Failed to upsert software inventory`, insertError);
    return new Response(JSON.stringify({ error: 'Failed to store inventory' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return { success: true, inserted: uniqueItems.length, deduplicated_from: items.length };
}
