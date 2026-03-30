/**
 * Domain classification and blocking logic
 * Extracted from submit-web-activity/index.ts
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const CATEGORY_RULES: Array<{ patterns: string[]; category: string }> = [
  { patterns: ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com'], category: 'social' },
  { patterns: ['youtube.com', 'netflix.com', 'twitch.tv', 'primevideo.com'], category: 'video' },
  { patterns: ['github.com', 'gitlab.com', 'notion.so', 'slack.com', 'teams.microsoft.com'], category: 'work' },
  { patterns: ['amazon.com', 'mercadolivre.com', 'shopee.com'], category: 'shopping' },
  { patterns: ['mail.google.com', 'outlook.com', 'yahoo.com'], category: 'email' },
  { patterns: ['google.com', 'bing.com', 'duckduckgo.com'], category: 'search' },
  { patterns: ['steam.com', 'epicgames.com', 'roblox.com'], category: 'games' },
  { patterns: ['bet365.com', 'betfair.com', 'blaze.com', 'pixbet.com'], category: 'gambling' },
];

export function categorizeDomain(domain: string): string {
  const d = domain.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some(p => d.includes(p))) return rule.category;
  }
  return 'other';
}

export async function loadBlockedPatterns(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data: blockedSites } = await supabase
    .from('blocked_websites')
    .select('domain_pattern')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  return blockedSites?.map(s => s.domain_pattern) || [];
}

export function isDomainBlocked(domain: string, blockedPatterns: string[]): boolean {
  const d = domain.toLowerCase();
  return blockedPatterns.some(pattern => {
    const p = pattern.toLowerCase();
    if (p.startsWith('*.')) {
      const suffix = p.slice(2);
      return d === suffix || d.endsWith('.' + suffix);
    }
    return d === p || d.endsWith('.' + p);
  });
}
