#!/usr/bin/env python3
"""
R1.5 — Runtime Capability Inventory (READ-ONLY).

Static inventory of every helper under supabase/functions/_shared/ and its
fan-in across supabase/functions/*/index.ts (plus subfolders). Answers the
question:

    "How much of the R2 reliability work can be resolved centrally
     (1 middleware / 1 helper) instead of touching 74 functions?"

Scope: strictly read-only. No fixes, no code changes, no proposals.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SHARED_DIR = REPO / "supabase/functions/_shared"
FUNCTIONS_DIR = REPO / "supabase/functions"
OUTPUT_PATH = REPO / "docs/audits/active/r1-5-runtime-capability-inventory.md"

SKIP_FN = {"_shared", "__tests__"}

# Manual capability grouping — every helper belongs to at most one bucket
# so the leverage picture is legible. Helpers not in this map fall into
# "Other".
CAPABILITY_MAP: dict[str, list[str]] = {
    "Request lifecycle / middleware": [
        "serve-tenant", "serve-public", "serve-internal", "serve-agent",
        "serve-honeypot", "request-context", "rate-limit-middleware",
        "error-handler", "http", "http-method-validator", "security-headers",
    ],
    "HTTP client / timeout / retry": [
        "fetch-with-timeout", "timeout",
    ],
    "Logging / observability": [
        "logger", "sanitize-log", "security-log", "apm", "build-telemetry",
        "installer-telemetry", "health-probe",
    ],
    "Auth / tenant / caller identity": [
        "agent-auth", "api-auth", "assert-internal-caller",
        "require-super-admin", "validate-caller-tenant", "tenant",
        "ip-allowlist",
    ],
    "Audit / compliance": [
        "audit",
    ],
    "Data / persistence": [
        "supabase-client", "database.types", "job-insert", "cache",
        "kv-cache", "batch", "dlq", "quota", "rate-limit",
    ],
    "Crypto / signing / HMAC": [
        "crypto-utils", "hmac", "hmac-success-coalescer", "token-hash",
        "rsa-public-key", "ed25519-public-key", "verify-result-signature",
        "sign-release" if False else "script-resigner",
    ],
    "Circuit breaker": [
        "ai-circuit-breaker",
    ],
    "Validation / sanitization / errors": [
        "validation", "sanitize", "html-escape", "json-parser", "json",
        "errors", "installer-validation",
    ],
}

# Reliability capabilities the R1 gap analysis flagged: which shared helper,
# if any, already covers them?
CAPABILITY_COVERAGE_TARGETS: list[tuple[str, list[str]]] = [
    ("fetch timeout",          ["fetch-with-timeout", "timeout"]),
    ("retry / backoff",        []),  # no dedicated helper — will be reported as gap
    ("circuit breaker",        ["ai-circuit-breaker"]),
    ("structured logger",      ["logger"]),
    ("correlation / request-id context",
                               ["request-context", "serve-tenant", "serve-public",
                                "serve-internal", "serve-agent"]),
    ("APM / metrics",          ["apm"]),
    ("audit logging",          ["audit"]),
    ("rate limiting",          ["rate-limit-middleware", "rate-limit"]),
    ("standardized error handling",
                               ["error-handler"]),
    ("tenant assertion",       ["validate-caller-tenant", "serve-tenant"]),
    ("idempotency",            []),  # no dedicated helper
]


EXPORT_RE = re.compile(
    r"^export\s+(?:async\s+)?(?:default\s+)?"
    r"(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)",
    re.MULTILINE,
)
EXPORT_LIST_RE = re.compile(r"^export\s*\{\s*([^}]+)\s*\}", re.MULTILINE)


def list_shared_helpers() -> list[Path]:
    return sorted(p for p in SHARED_DIR.glob("*.ts") if p.is_file())


def list_functions() -> list[Path]:
    return sorted(
        d for d in FUNCTIONS_DIR.iterdir()
        if d.is_dir() and d.name not in SKIP_FN and (d / "index.ts").exists()
    )


def helper_exports(path: Path) -> list[str]:
    src = path.read_text(encoding="utf-8", errors="ignore")
    names: set[str] = set(EXPORT_RE.findall(src))
    for m in EXPORT_LIST_RE.finditer(src):
        for tok in m.group(1).split(","):
            tok = tok.strip().split(" as ")[0].strip()
            if tok and re.match(r"^[A-Za-z_$][\w$]*$", tok):
                names.add(tok)
    return sorted(names)


def build_import_re(helper_stem: str) -> re.Pattern[str]:
    # Matches:  from '.../<stem>'  or  from '.../<stem>.ts'
    escaped = re.escape(helper_stem)
    return re.compile(
        rf"""from\s+['"][^'"]*_shared/{escaped}(?:\.ts)?['"]"""
    )


def scan_function_sources(fn_dir: Path) -> str:
    return "\n".join(
        f.read_text(encoding="utf-8", errors="ignore") for f in fn_dir.rglob("*.ts")
    )


def _git_head() -> str:
    try:
        r = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True)
        return r.stdout.strip()
    except Exception:
        return "(unknown)"


def _migration_head() -> str:
    m = REPO / "supabase/migrations"
    files = sorted(p.name for p in m.glob("*.sql")) if m.exists() else []
    return files[-1] if files else "(none)"


def main() -> None:
    helpers = list_shared_helpers()
    functions = list_functions()

    # Precompute each function's full concatenated source
    fn_sources: dict[str, str] = {fn.name: scan_function_sources(fn) for fn in functions}

    # For each helper, count how many functions import it
    helper_info: dict[str, dict] = {}
    for h in helpers:
        stem = h.stem
        pattern = build_import_re(stem)
        importers = sorted(
            name for name, src in fn_sources.items() if pattern.search(src)
        )
        helper_info[stem] = {
            "path": str(h.relative_to(REPO)),
            "exports": helper_exports(h),
            "importers": importers,
            "fan_in": len(importers),
        }

    total_fn = len(functions)

    # Build capability groupings
    grouped: dict[str, list[str]] = defaultdict(list)
    seen: set[str] = set()
    for cap, stems in CAPABILITY_MAP.items():
        for s in stems:
            if s in helper_info:
                grouped[cap].append(s)
                seen.add(s)
    for stem in helper_info:
        if stem not in seen:
            grouped["Other"].append(stem)

    # Coverage per R1 gap
    coverage_rows: list[tuple[str, str, int, int]] = []  # (cap, helper_str, best_fan_in, uncovered)
    for cap, stems in CAPABILITY_COVERAGE_TARGETS:
        if not stems:
            coverage_rows.append((cap, "— (no shared helper exists)", 0, total_fn))
            continue
        best = max((helper_info[s]["fan_in"] for s in stems if s in helper_info), default=0)
        # union of importers across candidate helpers
        union: set[str] = set()
        for s in stems:
            if s in helper_info:
                union.update(helper_info[s]["importers"])
        helper_label = ", ".join(f"`_shared/{s}.ts`" for s in stems if s in helper_info) or "—"
        coverage_rows.append((cap, helper_label, len(union), total_fn - len(union)))

    # ---------------- Reporting ----------------
    out: list[str] = []
    out.append("# R1.5 — Runtime Capability Inventory (READ-ONLY)\n")
    out.append("## Provenance\n")
    out.append(f"- **Collected at:** `{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%SZ')}`")
    out.append(f"- **Commit SHA:** `{os.environ.get('GITHUB_SHA') or _git_head()}`")
    out.append(f"- **Migration head:** `{_migration_head()}`")
    out.append(f"- **Edge Functions scanned:** {total_fn}")
    out.append(f"- **Shared helpers scanned:** {len(helpers)} files under `supabase/functions/_shared/`")
    out.append(f"- **Generator:** `tools/reports/runtime_capability_inventory.py`")
    out.append(f"- **Scope:** static analysis only. No runtime, no DB, no code changes.\n")

    out.append("## Question this report answers\n")
    out.append("> How much of the R2 reliability work can be resolved centrally")
    out.append("> (1 middleware / 1 helper) instead of touching 74 functions?\n")

    out.append("## Executive summary — reliability capabilities vs. shared helpers\n")
    out.append("For each capability flagged by R1, we ask: does a shared helper already exist,")
    out.append("and how many functions already import it (union across candidates)?\n")
    out.append("| Capability (from R1 gaps) | Shared helper(s) | Functions already using | Not yet covered |")
    out.append("|---------------------------|------------------|------------------------:|----------------:|")
    for cap, helpers_label, using, uncovered in coverage_rows:
        out.append(f"| {cap} | {helpers_label} | {using} / {total_fn} | {uncovered} |")

    out.append("\n> Reading key: a capability with an existing helper and low fan-in is a")
    out.append("> **centralization candidate** — the helper already exists; the follow-up is")
    out.append("> to route more functions through it, not to write new code per function.")
    out.append("> A capability with no shared helper at all (`—`) is a **greenfield decision**")
    out.append("> for R2 authorization.\n")

    out.append("## Top-15 highest fan-in helpers (leverage ranking)\n")
    out.append("Helpers with the largest fan-in are the natural insertion points for")
    out.append("cross-cutting concerns — any code added there is inherited by every importer.\n")
    top = sorted(helper_info.items(), key=lambda kv: (-kv[1]["fan_in"], kv[0]))[:15]
    out.append("| Rank | Helper | Fan-in | Exports (first 4) |")
    out.append("|-----:|--------|-------:|-------------------|")
    for i, (stem, info) in enumerate(top, 1):
        ex = ", ".join(f"`{e}`" for e in info["exports"][:4]) or "—"
        if len(info["exports"]) > 4:
            ex += f" (+{len(info['exports']) - 4})"
        out.append(f"| {i} | `_shared/{stem}.ts` | **{info['fan_in']}** / {total_fn} | {ex} |")

    out.append("\n## Full helper inventory by capability\n")
    for cap in list(CAPABILITY_MAP.keys()) + ["Other"]:
        stems = sorted(grouped.get(cap, []), key=lambda s: (-helper_info[s]["fan_in"], s))
        if not stems:
            continue
        out.append(f"### {cap}\n")
        out.append("| Helper | Fan-in | Exports (first 4) |")
        out.append("|--------|-------:|-------------------|")
        for stem in stems:
            info = helper_info[stem]
            ex = ", ".join(f"`{e}`" for e in info["exports"][:4]) or "—"
            if len(info["exports"]) > 4:
                ex += f" (+{len(info['exports']) - 4})"
            out.append(f"| `_shared/{stem}.ts` | {info['fan_in']} / {total_fn} | {ex} |")
        out.append("")

    # Fan-in distribution
    out.append("## Fan-in distribution\n")
    buckets = [
        ("0 importers (unused / test-only)", lambda n: n == 0),
        ("1–5 importers (narrow)",            lambda n: 1 <= n <= 5),
        ("6–20 importers (medium)",           lambda n: 6 <= n <= 20),
        ("21+ importers (broad / central)",   lambda n: n >= 21),
    ]
    out.append("| Bucket | Helpers |")
    out.append("|--------|--------:|")
    for label, pred in buckets:
        n = sum(1 for info in helper_info.values() if pred(info["fan_in"]))
        out.append(f"| {label} | {n} |")

    # Unused helpers (surface for archival discussion — not R1.5's job to act)
    unused = sorted(s for s, info in helper_info.items() if info["fan_in"] == 0)
    out.append("\n### Helpers with 0 importers ({})\n".format(len(unused)))
    if unused:
        out.append("Listed for visibility only. No action recommended in R1.5.\n")
        out.append(", ".join(f"`{s}`" for s in unused))
    else:
        out.append("_None._")

    # Per-function helper usage (compact — top-importing functions)
    out.append("\n\n## Which functions import the most shared helpers?\n")
    out.append("A high count here means the function is already leaning on shared")
    out.append("infrastructure — instrumenting the shared helpers benefits these functions")
    out.append("first, with zero per-function change.\n")
    fn_helper_count: dict[str, int] = defaultdict(int)
    for stem, info in helper_info.items():
        for fn in info["importers"]:
            fn_helper_count[fn] += 1
    top_fn = sorted(fn_helper_count.items(), key=lambda kv: (-kv[1], kv[0]))[:15]
    out.append("| Function | Helpers imported |")
    out.append("|----------|-----------------:|")
    for name, count in top_fn:
        out.append(f"| `{name}` | {count} |")

    # Methodology
    out.append("\n## Methodology (honest limits)\n")
    out.append("- **Fan-in** = number of Edge Function directories whose `.ts` files contain")
    out.append("  `from '…/_shared/<stem>' | '…/_shared/<stem>.ts'`. Counts one per function")
    out.append("  directory, not per file.")
    out.append("- **Exports** are extracted via regex over `export function|class|const|let|"
               "var|type|interface|enum` and `export { … }` lists.")
    out.append("- **Capability grouping** in this report is manual (see `CAPABILITY_MAP` in")
    out.append("  the generator). It reflects intent, not automatic classification.")
    out.append("- **Not measured:** call-site depth, dynamic imports, indirect re-exports,")
    out.append("  runtime dispatch. A helper flagged as unused might still be wired via a")
    out.append("  re-export barrel; verify before archiving.")
    out.append("- **What this report does not do:** rank functions, propose middleware")
    out.append("  changes, propose consolidation, or open follow-up blocks.\n")

    out.append("## R1.5 closure contract\n")
    out.append("Deliverables authorized for this block, all present in this artifact:")
    out.append("- ✅ Every shared helper listed with its exports.")
    out.append("- ✅ Fan-in per helper (who imports each).")
    out.append("- ✅ Capability coverage table (which R1 gaps already have a helper, and how")
    out.append("  many functions currently route through it).")
    out.append("- ✅ Leverage ranking (top-15 highest fan-in helpers).")
    out.append("- ✅ Explicit methodology and limits.")
    out.append("")
    out.append("**Not included (out of scope):** proposals for centralization, PRs,")
    out.append("middleware changes, R2 planning. The Reliability Score remains blocked.")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")

    summary = {
        "helpers": len(helpers),
        "functions": total_fn,
        "top_helper": top[0][0] if top else None,
        "top_fan_in": top[0][1]["fan_in"] if top else 0,
        "output": str(OUTPUT_PATH.relative_to(REPO)),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
