/**
 * Web activity deduplication and batch persistence
 * Extracted from submit-web-activity/index.ts
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { categorizeDomain, isDomainBlocked } from './dns-classifier.ts';

export interface WebActivityItem {
  domain: string;
  url?: string;
  url_full?: string;
  page_title?: string;
  visited_at?: string;
  source?: string;
  browser?: string;
  visit_count?: number;
  total_duration_seconds?: number;
}

interface PreparedItem {
  tenant_id: string;
  agent_id: string;
  domain: string;
  url: string | null;
  url_full: string | null;
  page_title: string | null;
  source: string;
  browser: string | null;
  visit_count: number;
  total_duration_seconds: number;
  category: string;
  is_blocked: boolean;
  visited_at: string;
}

export function prepareItems(
  items: WebActivityItem[],
  agentId: string,
  tenantId: string,
  blockedPatterns: string[],
): PreparedItem[] {
  const nowIso = new Date().toISOString();

  return items
    .filter(item => {
      if (!item.domain || typeof item.domain !== 'string' || item.domain.trim() === '') {
        logger.warn('Skipping item with invalid domain', { item });
        return false;
      }
      return true;
    })
    .map(item => {
      const sanitizedDomain = item.domain.trim().toLowerCase().replace(/[^\w.-]/g, '');
      return {
        tenant_id: tenantId,
        agent_id: agentId,
        domain: sanitizedDomain || 'unknown',
        url: item.url || null,
        url_full: item.url_full || item.url || null,
        page_title: item.page_title || null,
        source: item.source || 'dns_cache',
        browser: item.browser || (item.source?.includes('chrome') ? 'chrome' :
                                   item.source?.includes('firefox') ? 'firefox' :
                                   item.source?.includes('edge') ? 'edge' : null),
        visit_count: typeof item.visit_count === 'number' ? item.visit_count : 1,
        total_duration_seconds: typeof item.total_duration_seconds === 'number' ? item.total_duration_seconds : 0,
        category: categorizeDomain(sanitizedDomain),
        is_blocked: isDomainBlocked(sanitizedDomain, blockedPatterns),
        visited_at: item.visited_at || nowIso,
      };
    });
}

export function deduplicateItems(items: PreparedItem[]): PreparedItem[] {
  const map = new Map<string, PreparedItem>();
  for (const item of items) {
    const key = `${item.domain}:${item.source}`;
    const existing = map.get(key);
    if (existing) {
      existing.visit_count = (existing.visit_count || 1) + (item.visit_count || 1);
      existing.total_duration_seconds = (existing.total_duration_seconds || 0) + (item.total_duration_seconds || 0);
      if (new Date(item.visited_at) > new Date(existing.visited_at)) {
        existing.visited_at = item.visited_at;
        existing.page_title = item.page_title || existing.page_title;
        existing.url = item.url || existing.url;
        existing.url_full = item.url_full || existing.url_full;
      }
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

export async function persistActivity(
  supabase: SupabaseClient,
  agentId: string,
  items: PreparedItem[],
): Promise<{ insertedCount: number; updatedCount: number }> {
  let insertedCount = 0;
  let updatedCount = 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const domains = items.map(i => i.domain);
  const { data: existingRecords } = await supabase
    .from('agent_web_activity')
    .select('id, domain, visit_count, total_duration_seconds')
    .eq('agent_id', agentId)
    .in('domain', domains)
    .gte('visited_at', todayStart.toISOString());

  const existingMap = new Map<string, { id: string; visit_count: number; total_duration_seconds: number }>();
  for (const record of existingRecords || []) {
    existingMap.set(record.domain, record);
  }

  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
  const toInsert: PreparedItem[] = [];

  for (const item of items) {
    const existing = existingMap.get(item.domain);
    if (existing) {
      toUpdate.push({
        id: existing.id,
        data: {
          visit_count: (existing.visit_count || 1) + (item.visit_count || 1),
          total_duration_seconds: (existing.total_duration_seconds || 0) + (item.total_duration_seconds || 0),
          visited_at: item.visited_at,
          page_title: item.page_title,
          url: item.url,
          url_full: item.url_full,
        },
      });
    } else {
      toInsert.push(item);
    }
  }

  for (const update of toUpdate) {
    const { error } = await supabase
      .from('agent_web_activity')
      .update(update.data)
      .eq('id', update.id);
    if (!error) updatedCount++;
  }

  if (toInsert.length > 0) {
    const { error: batchErr } = await supabase.from('agent_web_activity').insert(toInsert);
    if (batchErr) {
      logger.error('Batch insert failed, falling back to individual', { error: batchErr.message });
      for (const item of toInsert) {
        const { error } = await supabase.from('agent_web_activity').insert(item);
        if (!error) insertedCount++;
      }
    } else {
      insertedCount = toInsert.length;
    }
  }

  return { insertedCount, updatedCount };
}
