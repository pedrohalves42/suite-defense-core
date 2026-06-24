import { describe, it, expect } from 'vitest';
import { serializeJsonLd } from '../safe-json-ld';

describe('serializeJsonLd', () => {
  it('escapes < and > to prevent </script> injection', () => {
    const out = serializeJsonLd({ x: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c');
    expect(out).toContain('\\u003e');
  });

  it('escapes & to neutralize HTML entities', () => {
    const out = serializeJsonLd({ x: 'a & b' });
    expect(out).toContain('\\u0026');
    expect(out).not.toMatch(/[^\\]&/);
  });

  it('escapes U+2028 and U+2029', () => {
    const out = serializeJsonLd({ x: 'line\u2028sep\u2029end' });
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
    expect(out).not.toMatch(/\u2028|\u2029/);
  });

  it('round-trips through JSON.parse for safe payloads', () => {
    const data = { name: 'CyberShield', tags: ['a', 'b'] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
