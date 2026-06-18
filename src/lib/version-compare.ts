/**
 * Robust semver-ish version comparator.
 *
 * Wave 4 — B33 fix: Replaces lexical string comparison ("3.10.9" < "3.9.0")
 * which caused `latestVersion` and `outdatedAgents` in useJobsHealth to be
 * computed incorrectly.
 *
 * Accepts versions like:
 *   - "3.10.9", "3.10.9-rc.1", "v3.10.9", "3.10.9+build.42"
 *   - Falsy / non-string inputs are treated as equal-or-lesser.
 *
 * Returns:
 *   - negative if a < b
 *   - 0 if equal (or both invalid)
 *   - positive if a > b
 */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);

  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;

  const len = Math.max(pa.numeric.length, pb.numeric.length);
  for (let i = 0; i < len; i++) {
    const va = pa.numeric[i] ?? 0;
    const vb = pb.numeric[i] ?? 0;
    if (va !== vb) return va - vb;
  }

  // Pre-release: absence of pre-release is greater than presence (1.0.0 > 1.0.0-rc)
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && !pb.prerelease) return -1;
  if (pa.prerelease && pb.prerelease) {
    return pa.prerelease.localeCompare(pb.prerelease);
  }
  return 0;
}

interface ParsedVersion {
  numeric: number[];
  prerelease: string | null;
}

function parseVersion(input: string | null | undefined): ParsedVersion | null {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.trim().replace(/^v/i, '');
  if (!cleaned) return null;

  // Strip build metadata
  const [versionPart, ...rest] = cleaned.split('+');
  void rest;

  const [corePart, ...prereleaseParts] = versionPart.split('-');
  const prerelease = prereleaseParts.length > 0 ? prereleaseParts.join('-') : null;

  const numeric = corePart
    .split('.')
    .map((seg) => {
      const n = Number.parseInt(seg, 10);
      return Number.isFinite(n) ? n : 0;
    });

  if (numeric.length === 0) return null;
  return { numeric, prerelease };
}

/** True when `candidate` is strictly older than `reference`. */
export function isOlderVersion(candidate: string | null | undefined, reference: string | null | undefined): boolean {
  if (!candidate || !reference) return false;
  return compareVersions(candidate, reference) < 0;
}
