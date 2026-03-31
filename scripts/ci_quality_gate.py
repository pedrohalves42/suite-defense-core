#!/usr/bin/env python3
"""
CI Quality Gate: Block functions exceeding line limits and detect banned patterns.

Usage:
  python3 scripts/ci_quality_gate.py [--max-lines 400] [--check-any] [--root supabase/functions]

Exit code 1 if violations found (blocks merge in CI).
"""
import argparse
import os
import re
import sys


def check_file(filepath: str, max_lines: int, check_any: bool) -> list[str]:
    violations = []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            lines = content.split("\n")
    except Exception:
        return []

    # Check line count
    if len(lines) > max_lines:
        violations.append(f"  OVER_LIMIT: {filepath} has {len(lines)} lines (max: {max_lines})")

    # Check for console.* in production code (not test files)
    if "__tests__" not in filepath and "test" not in filepath.lower():
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith("//"):
                continue
            if re.search(r"\bconsole\.(log|warn|error|debug|info)\b", stripped):
                violations.append(f"  CONSOLE: {filepath}:{i} — {stripped[:80]}")

    # Check for untyped `any` in production code
    if check_any and "__tests__" not in filepath and "test" not in filepath.lower():
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith("//") or "deno-lint-ignore" in stripped or "eslint-disable" in stripped:
                continue
            if re.search(r":\s*any\b", stripped) or re.search(r"\bas\s+any\b", stripped):
                violations.append(f"  ANY_TYPE: {filepath}:{i} — {stripped[:80]}")

    return violations


EXEMPT_FROM_ZOD = {
    "_shared", "health", "serve-installer", "get-latest-agent-script",
    "get-reinstall-script", "get-reinstall-by-name", "get-reinstall-preserve-script",
    "get-diagnostic-script", "setup-agent-script", "serve-agent-update",
    "serve-dns-filter", "stripe-webhook", "heartbeat",
    "check-trial-expiration", "cleanup-stuck-builds", "cleanup-stuck-jobs",
    "cleanup-old-data", "cleanup-old-metrics", "reset-daily-quotas",
    "cron-sentinel", "build-watchdog", "health-monitor",
    "security-monitor", "security-alert-dispatcher",
    "autonomous-safe-mode", "maintenance-cron", "invoke-scheduled-jobs",
    "watchdog-non-execution", "check-stuck-jobs", "check-pending-agents",
    "stripe-health-check", "run-rls-tests", "verify-log-integrity",
    "verify-document", "validate-build-pipeline", "integrity-sentinel",
}


def check_zod_validation(filepath: str, entry: str) -> list[str]:
    """Check if a function that accepts body input has Zod validation."""
    violations = []
    if entry in EXEMPT_FROM_ZOD:
        return violations

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return violations

    has_body_input = any(
        kw in content
        for kw in ["req.json", "ctx.body", "body as", "body."]
    )
    has_mutation = any(
        kw in content
        for kw in [".insert(", ".update(", ".upsert(", ".delete("]
    )

    if not (has_body_input and has_mutation):
        return violations

    has_zod = "safeParse" in content or "zod" in content.lower() or ".parse(" in content

    if not has_zod:
        violations.append(f"  NO_ZOD: {filepath} — accepts body input with mutations but has no Zod validation")

    return violations


def main():
    parser = argparse.ArgumentParser(description="CI Quality Gate")
    parser.add_argument("--max-lines", type=int, default=400, help="Max lines per function index.ts")
    parser.add_argument("--check-any", action="store_true", help="Check for `any` type usage")
    parser.add_argument("--check-zod", action="store_true", help="Check for missing Zod validation")
    parser.add_argument("--root", default="supabase/functions", help="Root directory to scan")
    parser.add_argument("--console-only", action="store_true", help="Only check console.* usage")
    args = parser.parse_args()

    all_violations: list[str] = []

    for entry in sorted(os.listdir(args.root)):
        idx = os.path.join(args.root, entry, "index.ts")
        if not os.path.isfile(idx):
            continue
        violations = check_file(idx, args.max_lines, args.check_any)
        all_violations.extend(violations)

        if args.check_zod:
            all_violations.extend(check_zod_validation(idx, entry))

    if all_violations:
        print(f"❌ CI Quality Gate: {len(all_violations)} violation(s) found:\n")
        for v in all_violations:
            print(v)
        print(f"\nTotal: {len(all_violations)} violations")
        sys.exit(1)
    else:
        print("✅ CI Quality Gate: All checks passed")
        sys.exit(0)


if __name__ == "__main__":
    main()
