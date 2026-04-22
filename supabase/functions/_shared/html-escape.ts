/**
 * HTML escaping utility for edge functions that render HTML responses.
 * Prevents reflected XSS via template-string interpolation (OWASP A03: Injection).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
