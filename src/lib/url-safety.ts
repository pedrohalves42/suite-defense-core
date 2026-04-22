/**
 * URL safety utilities aligned with OWASP recommendations.
 * - isSafeHref: blocks javascript:, data:, vbscript:, file: schemes that enable XSS via href injection.
 * - isSafeRedirectUrl: validates that a server-supplied redirect targets an allow-listed origin,
 *   preventing open-redirect (OWASP A01: Broken Access Control / Unvalidated Redirects & Forwards).
 */

const SAFE_HREF_SCHEMES = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
  'sms:',
]);

/**
 * Allow-list of origins that are valid as post-action redirect targets.
 * Edit this list when adding a new trusted partner / OAuth IdP / billing portal.
 */
const ALLOWED_REDIRECT_HOSTS = [
  // CyberShield-owned
  /\.cybshield\.com\.br$/i,
  /\.cybershield\.com\.br$/i,
  /\.lovable\.app$/i,
  /\.lovableproject\.com$/i,
  /\.lovable\.dev$/i,
  // Trusted billing / auth providers
  /(^|\.)stripe\.com$/i,
  /(^|\.)checkout\.stripe\.com$/i,
  /(^|\.)billing\.stripe\.com$/i,
  // SAML/OIDC IdPs commonly used in enterprise SSO
  /(^|\.)okta\.com$/i,
  /(^|\.)okta-emea\.com$/i,
  /(^|\.)microsoftonline\.com$/i,
  /(^|\.)login\.microsoftonline\.com$/i,
  /(^|\.)accounts\.google\.com$/i,
  /(^|\.)onelogin\.com$/i,
  /(^|\.)auth0\.com$/i,
];

const EXACT_ALLOWED_HOSTS = new Set([
  'cybshield.com.br',
  'www.cybshield.com.br',
  'cybershield.com.br',
  'www.cybershield.com.br',
  'stripe.com',
  'checkout.stripe.com',
  'billing.stripe.com',
]);

/**
 * Returns true when an href is safe to render in an <a> element.
 * Blocks `javascript:`, `data:`, `vbscript:`, and unknown schemes.
 * Relative URLs (starting with `/`, `#`, `?`) are allowed.
 */
export function isSafeHref(href: string | null | undefined): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (!trimmed) return false;

  // Relative URLs are safe (same-origin).
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('?')) {
    return true;
  }

  try {
    // Use a base so relative URLs resolve; absolute URLs ignore it.
    const url = new URL(trimmed, 'https://placeholder.invalid');
    return SAFE_HREF_SCHEMES.has(url.protocol.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Sanitize an href for safe rendering. Returns `undefined` for unsafe values
 * so React renders the anchor without a navigable target.
 */
export function sanitizeHref(href: string | null | undefined): string | undefined {
  return isSafeHref(href) ? href!.trim() : undefined;
}

/**
 * Validate a server-supplied URL before assigning to `window.location.href`.
 * Blocks open-redirect attacks by requiring the URL to:
 *   1. Parse as an absolute https:// URL (or be a same-origin relative path), AND
 *   2. Match the allow-list of trusted hosts (when absolute).
 */
export function isSafeRedirectUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Same-origin relative paths are always safe.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();

    // Same-origin is always allowed.
    if (typeof window !== 'undefined' && host === window.location.hostname.toLowerCase()) {
      return true;
    }

    if (EXACT_ALLOWED_HOSTS.has(host)) return true;

    return ALLOWED_REDIRECT_HOSTS.some((rx) => rx.test(host));
  } catch {
    return false;
  }
}

/**
 * Perform a hard navigation to a server-supplied URL only if it passes the
 * open-redirect allow-list. Returns true on success, false when blocked.
 */
export function safeNavigate(url: string | null | undefined): boolean {
  if (!isSafeRedirectUrl(url)) {
    // eslint-disable-next-line no-console
    console.warn('[security] Blocked unsafe redirect attempt');
    return false;
  }
  window.location.href = url!;
  return true;
}

/**
 * HTML-escape a string for safe interpolation into server-rendered HTML
 * templates (e.g., edge-function HTML responses). Mitigates reflected XSS
 * (OWASP A03: Injection).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
