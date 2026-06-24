/**
 * Safe JSON-LD serialization helper.
 *
 * JSON.stringify alone is unsafe for inline <script> contexts:
 *   - `</script>` inside a string would close the script tag (XSS).
 *   - U+2028 / U+2029 are valid in JSON but invalid in JS string literals
 *     (older parsers throw; some inject newlines into the surrounding script).
 *   - `<!--` can start an HTML comment that swallows trailing markup.
 *
 * This helper escapes those sequences so the result is safe to embed in a
 * `<script type="application/ld+json">` block. Centralizing this here is the
 * ONLY place outside `FormattedText` allowed to use dangerouslySetInnerHTML.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
