/**
 * edr-ops — Phase 2I handlers
 * Inlined from: fetch-nvd-cves, correlate-edr-events, evaluate-edr-detections
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';

type InlinedHandler = (supabase: any, requestId: string, payload: Record<string, unknown>) => Promise<unknown>;

// ── fetch-nvd-cves ─────────────────────────────────────────────────────

const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const NVD_FETCH_TIMEOUT_MS = 30000;

interface NVDResponse {
  resultsPerPage: number; startIndex: number; totalResults: number;
  vulnerabilities: Array<{ cve: Record<string, unknown> }>;
}

export const handleFetchNvdCves: InlinedHandler = async (supabase, requestId, payload) => {
  const keyword = payload.keyword as string | undefined;
  const cpeMatchString = payload.cpeMatchString as string | undefined;
  const cveId = payload.cveId as string | undefined;
  const lastModStartDate = payload.lastModStartDate as string | undefined;
  const resultsPerPage = Math.min(Math.max((payload.resultsPerPage as number) || 50, 1), 2000);
  const startIndex = Math.max((payload.startIndex as number) || 0, 0);
  const forceRefresh = (payload.forceRefresh as boolean) || false;

  logger.info(`[${requestId}] [FETCH-NVD] Starting NVD CVE fetch`);

  // Check cache first
  if (!forceRefresh && keyword) {
    const { data: cachedCVEs, error: cacheError } = await supabase
      .from('cve_database').select('cve_id, description, cvss_score, severity, affected_products, published_date, cached_at, references')
      .ilike('affected_products', `%${keyword}%`)
      .gte('cached_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('cvss_score', { ascending: false }).limit(100);

    if (!cacheError && cachedCVEs && cachedCVEs.length > 0) {
      logger.info(`[${requestId}] [FETCH-NVD] Cache hit: ${cachedCVEs.length} CVEs`);
      return { success: true, source: 'cache', cves: cachedCVEs, total: cachedCVEs.length };
    }
  }

  const params = new URLSearchParams();
  if (cveId) params.append('cveId', cveId);
  else if (cpeMatchString) params.append('cpeName', cpeMatchString);
  else if (keyword) { params.append('keywordSearch', keyword); params.append('keywordExactMatch', 'false'); }
  if (lastModStartDate) { params.append('lastModStartDate', lastModStartDate); params.append('lastModEndDate', new Date().toISOString()); }
  params.append('resultsPerPage', String(resultsPerPage));
  params.append('startIndex', String(startIndex));

  const nvdUrl = `${NVD_API_BASE}?${params.toString()}`;
  logger.info(`[${requestId}] [FETCH-NVD] Fetching: ${nvdUrl}`);

  const nvdResponse = await fetchWithTimeout(nvdUrl, {
    timeoutMs: NVD_FETCH_TIMEOUT_MS,
    headers: { 'Accept': 'application/json', 'User-Agent': 'CyberShield-Security-Scanner/1.0' },
  });

  if (!nvdResponse.ok) {
    if (nvdResponse.status === 403 || nvdResponse.status === 429) {
      return { error: 'NVD API rate limit exceeded', retry_after_seconds: 30, _status: 429 };
    }
    throw new Error(`NVD API error: ${nvdResponse.status}`);
  }

  const nvdData: NVDResponse = await nvdResponse.json();
  logger.info(`[${requestId}] [FETCH-NVD] NVD returned ${nvdData.totalResults} total, ${nvdData.vulnerabilities.length} in page`);

  const cveRecords = nvdData.vulnerabilities.map(vuln => {
    const cve = vuln.cve;
    const metrics = cve.metrics as Record<string, unknown[]> | undefined;
    const cvssV31 = (metrics?.cvssMetricV31 as Array<{ cvssData: Record<string, unknown> }>)?.[0]?.cvssData;
    const cvssV30 = (metrics?.cvssMetricV30 as Array<{ cvssData: Record<string, unknown> }>)?.[0]?.cvssData;
    const cvssV2 = (metrics?.cvssMetricV2 as any[])?.[0];

    let cvss_score: number | null = null, cvss_version = '3.1', cvss_vector: string | null = null, severity = 'UNKNOWN';
    if (cvssV31) { cvss_score = cvssV31.baseScore as number; cvss_version = cvssV31.version as string; cvss_vector = cvssV31.vectorString as string; severity = cvssV31.baseSeverity as string; }
    else if (cvssV30) { cvss_score = cvssV30.baseScore as number; cvss_version = cvssV30.version as string; cvss_vector = cvssV30.vectorString as string; severity = cvssV30.baseSeverity as string; }
    else if (cvssV2) { const d = cvssV2.cvssData as Record<string, unknown>; cvss_score = d.baseScore as number; cvss_version = d.version as string; cvss_vector = d.vectorString as string; severity = (cvssV2.baseSeverity || 'MEDIUM') as string; }

    const descriptions = cve.descriptions as Array<{ lang: string; value: string }>;
    const description = descriptions?.find(d => d.lang === 'en')?.value || descriptions?.[0]?.value || 'No description';

    const affected_products: string[] = [];
    const configurations = cve.configurations as Array<{ nodes: Array<{ cpeMatch: any[] }> }> | undefined;
    configurations?.forEach(config => config.nodes?.forEach(node => node.cpeMatch?.forEach(match => {
      if (match.vulnerable) {
        const parts = (match.criteria as string).split(':');
        if (parts.length >= 5) { const name = `${parts[3]}/${parts[4]}`.replace(/_/g, ' '); if (!affected_products.includes(name)) affected_products.push(name); }
      }
    })));

    const weaknesses: string[] = [];
    (cve.weaknesses as Array<{ description: Array<{ value: string }> }> | undefined)?.forEach(w => w.description?.forEach(d => { if (d.value?.startsWith('CWE-')) weaknesses.push(d.value); }));

    return {
      cve_id: cve.id as string, description, cvss_score, cvss_version, cvss_vector, severity,
      affected_products, affected_versions: [], cpe_matches: [],
      published_date: cve.published as string, last_modified: cve.lastModified as string,
      cve_references: ((cve.references as any[]) || []).map(r => ({ url: r.url, source: r.source, tags: r.tags || [] })),
      weaknesses, cached_at: new Date().toISOString(), source: 'nvd', is_active: true,
    };
  });

  if (cveRecords.length > 0) {
    const { error: upsertError } = await supabase.from('cve_database').upsert(cveRecords, { onConflict: 'cve_id', ignoreDuplicates: false });
    if (upsertError) logger.error(`[${requestId}] [FETCH-NVD] Upsert error:`, upsertError);
    else logger.info(`[${requestId}] [FETCH-NVD] Cached ${cveRecords.length} CVEs`);
  }

  return {
    success: true, source: 'nvd_api', cves: cveRecords, total: nvdData.totalResults,
    page: { resultsPerPage: nvdData.resultsPerPage, startIndex: nvdData.startIndex, hasMore: nvdData.startIndex + nvdData.resultsPerPage < nvdData.totalResults },
  };
};

// ── correlate-edr-events ───────────────────────────────────────────────

async function createIncident(supabase: any, tenantId: string, agentId: string, rule: Record<string, unknown>, matchedDets: any[], tactics: string[]) {
  const techniques = [...new Set(matchedDets.map(m => m.mitre_technique_id).filter(Boolean))];
  const firstTime = matchedDets[0].event_time;
  const lastTime = matchedDets[matchedDets.length - 1].event_time;

  const { data: existingIncident } = await supabase.from('correlated_incidents').select('id').eq('tenant_id', tenantId).eq('correlation_rule', rule.rule_name).contains('affected_agents', [agentId]).gte('last_event_time', firstTime).maybeSingle();
  if (existingIncident) return;

  const { data: incident, error } = await supabase.from('correlated_incidents').insert({
    tenant_id: tenantId, title: `${rule.rule_name} — ${matchedDets.length} events`,
    description: `Correlation rule "${rule.rule_name}" matched ${matchedDets.length} events on agent ${agentId}. Tactics: ${tactics.join(', ')}`,
    severity: rule.severity, confidence_score: Math.min(95, 50 + matchedDets.length * 10),
    mitre_tactics: tactics, mitre_techniques: techniques, affected_agents: [agentId],
    event_count: matchedDets.length, first_event_time: firstTime, last_event_time: lastTime, correlation_rule: rule.rule_name,
  }).select('id').single();

  if (error || !incident) return;

  const eventLinks = matchedDets.map(det => ({ incident_id: incident.id, tenant_id: tenantId, detection_event_id: det.id, event_type: det.source_event_type || 'detection', event_summary: `${det.detection_name} (${det.mitre_technique_id || 'N/A'})`, event_time: det.event_time, agent_id: agentId, severity: det.severity, event_data: { detection_name: det.detection_name, command_line: det.command_line, process_name: det.process_name } }));
  const detIds = matchedDets.map(d => d.id);

  // deno-lint-ignore no-explicit-any
  const postOps: Promise<any>[] = [
    supabase.from('correlated_incident_events').insert(eventLinks),
    supabase.from('endpoint_detection_events').update({ status: 'investigating' }).in('id', detIds).eq('status', 'open'),
  ];
  if (rule.severity === 'critical') {
    postOps.push(supabase.from('system_alerts').insert({ tenant_id: tenantId, alert_type: 'correlated_incident', severity: 'critical', title: `[INCIDENT] ${rule.rule_name}`, description: `Multi-signal attack detected: ${tactics.join(' → ')}`, status: 'active', metadata: { incident_id: incident.id, affected_agents: [agentId], techniques } }));
  }
  await Promise.all(postOps);
}

export const handleCorrelateEdrEvents: InlinedHandler = async (supabase, requestId, payload) => {
  const lookbackMinutes = Math.min(Math.max((payload.lookback_minutes as number) || 60, 1), 1440);
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

  const { data: rules } = await supabase.from('correlation_rules').select('id, name, tenant_id, event_types, conditions, time_window_seconds, min_occurrences, severity, is_enabled').eq('is_enabled', true);
  if (!rules?.length) return { message: 'No active correlation rules' };

  const ruleTenantIds = [...new Set(rules.map(r => r.tenant_id).filter(Boolean))] as string[];
  const hasGlobalRules = rules.some(r => !r.tenant_id);
  let allTenantIds: string[] = ruleTenantIds;

  if (hasGlobalRules) {
    const { data: tenantRows } = await supabase.from('endpoint_detection_events').select('tenant_id').gte('event_time', since).eq('status', 'open').limit(2000);
    const fromEvents = [...new Set((tenantRows || []).map(r => r.tenant_id))];
    allTenantIds = [...new Set([...ruleTenantIds, ...fromEvents])];
  }

  if (!allTenantIds.length) return { message: 'No tenants with active rules/detections' };

  let incidentsCreated = 0;

  for (const tenantId of allTenantIds) {
    const { data: detections } = await supabase.from('endpoint_detection_events')
      .select('id, tenant_id, agent_id, mitre_technique_id, mitre_tactic, detection_name, severity, event_time, source_event_type, status, command_line, process_name')
      .eq('tenant_id', tenantId).gte('event_time', since).eq('status', 'open').order('event_time', { ascending: true }).limit(1000);
    if (!detections?.length) continue;

    const agentGroups = new Map<string, typeof detections>();
    for (const det of detections) {
      if (!agentGroups.has(det.agent_id)) agentGroups.set(det.agent_id, []);
      agentGroups.get(det.agent_id)!.push(det);
    }

    for (const [agentId, agentDets] of agentGroups) {
      if (agentDets.length < 2) continue;
      const tenantRules = rules.filter(r => !r.tenant_id || r.tenant_id === tenantId);

      for (const rule of tenantRules) {
        const windowMs = rule.time_window_minutes * 60 * 1000;
        const patterns = rule.event_patterns as any[];

        const distinctTacticsRule = patterns.find((p: Record<string, unknown>) => p.distinct_tactics);
        if (distinctTacticsRule) {
          let bestMatch: { tactics: Set<string>; dets: typeof agentDets } | null = null;
          for (let i = 0; i < agentDets.length; i++) {
            const windowStartTime = new Date(agentDets[i].event_time).getTime();
            const tacticsInWindow = new Set<string>();
            const matchedDets: typeof agentDets = [];
            for (let j = i; j < agentDets.length; j++) {
              if (new Date(agentDets[j].event_time).getTime() - windowStartTime > windowMs) break;
              if (agentDets[j].mitre_tactic) { tacticsInWindow.add(agentDets[j].mitre_tactic); matchedDets.push(agentDets[j]); }
            }
            if (tacticsInWindow.size >= (distinctTacticsRule.distinct_tactics as number) && matchedDets.length >= rule.min_events) {
              if (!bestMatch || tacticsInWindow.size > bestMatch.tactics.size) bestMatch = { tactics: tacticsInWindow, dets: matchedDets };
            }
          }
          if (bestMatch) { await createIncident(supabase, tenantId, agentId, rule, bestMatch.dets, Array.from(bestMatch.tactics)); incidentsCreated++; continue; }
        }

        if (patterns.length >= 2 && !patterns.some((p: Record<string, unknown>) => p.distinct_tactics)) {
          const matched: typeof agentDets = [];
          let patternIdx = 0;
          for (const det of agentDets) {
            const pattern = patterns[patternIdx];
            if (!pattern) break;
            if ((!pattern.mitre_tactic || det.mitre_tactic === pattern.mitre_tactic) && (!pattern.mitre_technique_id || det.mitre_technique_id === pattern.mitre_technique_id) && (!pattern.event_type || pattern.event_type === 'any' || det.source_event_type === pattern.event_type)) {
              if (matched.length === 0 || (new Date(det.event_time).getTime() - new Date(matched[0].event_time).getTime()) <= windowMs) { matched.push(det); patternIdx++; }
            }
          }
          if (matched.length >= rule.min_events && patternIdx >= patterns.length) {
            await createIncident(supabase, tenantId, agentId, rule, matched, [...new Set(matched.map(m => m.mitre_tactic).filter(Boolean))]);
            incidentsCreated++;
          }
        }
      }
    }
  }

  logger.info(`[${requestId}] Created ${incidentsCreated} incidents`);
  return { success: true, incidents_created: incidentsCreated };
};

// ── evaluate-edr-detections ────────────────────────────────────────────

const BATCH_SIZE = 500;

interface DetectionRule {
  id: string; tenant_id: string | null; rule_name: string; severity: string;
  confidence_base: number; mitre_technique_id: string; mitre_tactic: string;
  mitre_technique_name: string; event_type: string;
  rule_logic: { field: string; operator: 'contains' | 'equals' | 'regex' | 'not_contains' | 'starts_with'; value: string; and?: Array<{ field: string; operator: string; value: string }>; };
}

const regexCache = new Map<string, RegExp>();
function getCachedRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) { re = new RegExp(pattern, 'i'); regexCache.set(pattern, re); }
  return re;
}

function matchesCondition(event: Record<string, unknown>, condition: { field: string; operator: string; value: string }): boolean {
  const fieldValue = String(event[condition.field] || '').toLowerCase();
  const matchValue = condition.value.toLowerCase();
  switch (condition.operator) {
    case 'contains': return fieldValue.includes(matchValue);
    case 'equals': return fieldValue === matchValue;
    case 'not_contains': return !fieldValue.includes(matchValue);
    case 'starts_with': return fieldValue.startsWith(matchValue);
    case 'regex': try { return getCachedRegex(condition.value).test(fieldValue); } catch { return false; }
    default: return false;
  }
}

function evaluateRule(event: Record<string, unknown>, rule: DetectionRule): boolean {
  const logic = (rule as any).rule_logic || (rule as any).conditions;
  if (!logic?.field) return false;
  const mainMatch = matchesCondition(event, logic);
  if (!mainMatch) return false;
  if (logic.and?.length) return logic.and.every(cond => matchesCondition(event, cond));
  return true;
}

export const handleEvaluateEdrDetections: InlinedHandler = async (supabase, requestId, payload) => {
  const lookbackMinutes = Math.min(Math.max((payload.lookback_minutes as number) || 15, 1), 1440);
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

  const { data: rules, error: rulesErr } = await supabase.from('detection_rules').select('id, name, tenant_id, event_type, conditions, severity, is_enabled, action_type, mitre_technique_id, mitre_tactic, confidence_base').eq('is_enabled', true);
  if (rulesErr || !rules?.length) return { message: 'No active rules', error: rulesErr?.message };

  const stats = { evaluated: 0, detections: 0 };
  const eventTypes = [...new Set(rules.map(r => r.event_type))];
  const allTenantIds = new Set([...new Set(rules.map(r => r.tenant_id).filter(Boolean))] as string[]);
  const hasGlobalRules = rules.some(r => !r.tenant_id);

  if (hasGlobalRules) {
    for (const eventType of eventTypes) {
      const table = `endpoint_${eventType}_events`;
      const { data: tenantRows } = await supabase.from(table).select('tenant_id').gte('event_time', since).limit(1000);
      if (tenantRows) { for (const row of tenantRows) allTenantIds.add(row.tenant_id); }
    }
  }

  for (const tenantId of allTenantIds) {
    const tenantRules = rules.filter(r => !r.tenant_id || r.tenant_id === tenantId);
    for (const eventType of eventTypes) {
      const table = `endpoint_${eventType}_events`;
      const typeRules = tenantRules.filter(r => r.event_type === eventType);
      if (!typeRules.length) continue;

      let offset = 0; let hasMore = true;
      while (hasMore) {
        const { data: events } = await supabase.from(table).select('id, tenant_id, agent_id, event_type, event_time, event_data, is_suspicious, severity').eq('tenant_id', tenantId).gte('event_time', since).eq('is_suspicious', false).range(offset, offset + BATCH_SIZE - 1).order('event_time', { ascending: true });
        if (!events?.length) { hasMore = false; break; }
        stats.evaluated += events.length;
        if (events.length < BATCH_SIZE) hasMore = false;

        const newDetections: any[] = [];
        const matchedEventIds: string[] = [];
        const eventTagsMap = new Map<string, string[]>();

        for (const event of events) {
          for (const rule of typeRules) {
            if (evaluateRule(event, rule)) {
              newDetections.push({ tenant_id: tenantId, agent_id: event.agent_id, detection_name: rule.rule_name, severity: rule.severity, confidence_score: rule.confidence_base, mitre_technique_id: rule.mitre_technique_id, mitre_tactic: rule.mitre_tactic, mitre_technique_name: rule.mitre_technique_name, description: `Rule "${rule.rule_name}" matched on ${eventType} event`, source_event_type: eventType, source_event_data: { event_id: event.id, process_name: event.process_name, command_line: (event.command_line || '').substring(0, 500) }, process_name: event.process_name, process_pid: event.pid || event.process_pid, command_line: event.command_line, file_path: event.file_path, remote_address: event.remote_address, event_time: event.event_time });
              matchedEventIds.push(event.id);
              const existing = eventTagsMap.get(event.id) || (event.detection_tags || []);
              existing.push(rule.id);
              eventTagsMap.set(event.id, existing);
            }
          }
        }

        if (matchedEventIds.length > 0) {
          const uniqueIds = [...new Set(matchedEventIds)];
          await supabase.from(table).update({ is_suspicious: true }).in('id', uniqueIds);
          const tagSetGroups = new Map<string, string[]>();
          for (const [eventId, tags] of eventTagsMap) {
            const key = [...new Set(tags)].sort().join(',');
            if (!tagSetGroups.has(key)) tagSetGroups.set(key, []);
            tagSetGroups.get(key)!.push(eventId);
          }
          await Promise.all([...tagSetGroups.entries()].map(([tagKey, eventIds]) => supabase.from(table).update({ detection_tags: tagKey.split(',') }).in('id', eventIds)));
        }

        if (newDetections.length > 0) {
          const { error } = await supabase.from('endpoint_detection_events').insert(newDetections);
          if (error) logger.error(`[${requestId}] Insert error:`, error.message);
          else stats.detections += newDetections.length;
        }
        offset += BATCH_SIZE;
      }
    }
  }

  logger.info(`[${requestId}] Evaluated=${stats.evaluated} Detections=${stats.detections}`);
  return { success: true, stats };
};