/**
 * Shared domain matching logic used by web-activity side-effects 
 * and post-completion blocked access analysis.
 */

/**
 * Checks if a domain matches any of the given patterns.
 * Supports wildcard (*.example.com) and exact/subdomain matching.
 */
export function matchDomainAgainstPatterns(domain: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2)
      if (domain === base || domain.endsWith('.' + base)) return true
    } else if (domain === pattern || domain.endsWith('.' + pattern)) {
      return true
    }
  }
  return false
}

/**
 * Finds the first matching policy for a domain from a list of blocked sites.
 * Returns the policy_id or null.
 */
export function findMatchingPolicy(
  domain: string, 
  blockedSites: Array<{ id: string; domain_pattern: string }>
): string | null {
  for (const site of blockedSites) {
    const pattern = site.domain_pattern.toLowerCase()
    let matches = false
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2)
      matches = domain === baseDomain || domain.endsWith('.' + baseDomain)
    } else {
      matches = domain === pattern || domain.endsWith('.' + pattern)
    }
    if (matches) return site.id
  }
  return null
}
