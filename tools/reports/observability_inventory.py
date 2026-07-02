#!/usr/bin/env python3
"""
R1 — Observability Inventory (READ-ONLY).

Static-analysis inventory of every Edge Function under supabase/functions/.
Emits a single Markdown artifact with:
  1. Executive summary (COMPLETE / PARTIAL / MINIMAL / NONE counts)
  2. Per-function coverage matrix (10 observability columns + 7 reliability columns)
  3. Gaps grouped by category
  4. Call graph (frontend caller -> function -> RPCs -> tables)

Detection is HEURISTIC and honest about it. Every rule below is documented in
the artifact so a reader can decide whether a "no" is a false negative.

Scope: strictly read-only. No fixes, no scores, no ranking.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FUNCTIONS_DIR = REPO / "supabase/functions"
FRONTEND_ROOTS = ["src", "e2e", "tests", "contracts"]
OUTPUT_PATH = REPO / "docs/audits/active/r1-observability-inventory.md"

SKIP_DIRS = {"_shared", "__tests__"}


# ---------- Heuristics -----------------------------------------------------

def _has_any(src: str, patterns: list[str]) -> bool:
    return any(re.search(p, src) for p in patterns)


def _has_structured_logs(src: str) -> bool:
    return _has_any(src, [
        r"from ['\"].*_shared/logger(\.ts)?['\"]",
        r"loggerWithContext\s*\(",
        r"\blogger\.(info|warn|error|debug|success)\s*\(",
    ])


def _has_correlation_id(src: str) -> bool:
    return _has_any(src, [
        r"['\"][xX]-[rR]equest-[iI][dD]['\"]",
        r"\brequestId\b",
        r"\bcorrelation[_-]?id\b",
    ])


def _has_request_id_response(src: str) -> bool:
    # Distinct from correlation-in-logs: does the function echo/propagate an ID header?
    return _has_any(src, [
        r"['\"][xX]-[rR]equest-[iI][dD]['\"]\s*:",
        r"headers\.get\(\s*['\"]x-request-id",
        r"headers\.get\(\s*['\"]x-trace-id",
    ])


def _has_tenant_in_logs(src: str) -> bool:
    return _has_any(src, [
        r"loggerWithContext\s*\([^)]*tenantId",
        r"\btenantId\s*[:,]",  # LogContext usage
        r"logger\.[a-z]+\([^)]*tenant",
    ])


def _has_auth_uid_in_logs(src: str) -> bool:
    return _has_any(src, [
        r"loggerWithContext\s*\([^)]*(userId|user_id|uid)",
        r"logger\.[a-z]+\([^)]*(user_id|userId|uid)",
    ])


def _has_duration_tracking(src: str) -> bool:
    # Either explicit duration_ms in logs/metrics, or start/end timing pattern.
    if re.search(r"\bduration_ms\b", src):
        return True
    if re.search(r"const\s+start\s*=\s*(Date\.now|performance\.now)\s*\(\s*\)", src) \
       and re.search(r"(Date\.now|performance\.now)\s*\(\s*\)\s*-\s*start\b", src):
        return True
    return False


def _has_metrics(src: str) -> bool:
    return _has_any(src, [
        r"from ['\"].*_shared/apm(\.ts)?['\"]",
        r"\brecordMetric\s*\(",
        r"\bedge_function_metrics\b",
        r"\bperformance_metrics\b",
    ])


def _has_structured_errors(src: str) -> bool:
    has_logger_err = bool(re.search(r"\blogger\.error\s*\(", src))
    only_console = bool(re.search(r"\bconsole\.error\s*\(", src)) and not has_logger_err
    return has_logger_err and not only_console


def _has_audit(src: str) -> bool:
    return _has_any(src, [
        r"from ['\"].*_shared/audit(\.ts)?['\"]",
        r"\bcreateAuditLog\s*\(",
        r"\.from\(\s*['\"]audit_logs['\"]",
    ])


def _has_timeout(src: str) -> bool:
    return _has_any(src, [
        r"AbortSignal\.timeout\s*\(",
        r"new\s+AbortController\s*\(",
        r"signal\s*:\s*[A-Za-z_$][\w$]*\.signal",
    ])


def _has_retry(src: str) -> bool:
    return _has_any(src, [
        r"\bretry\s*[:=]",
        r"\bmaxRetries\b",
        r"\battempt\s*<\s*\d",
        r"\bbackoff\b",
    ])


def _has_circuit_breaker(src: str) -> bool:
    return _has_any(src, [
        r"from ['\"].*ai-circuit-breaker",
        r"\bcircuit[_-]?breaker\b",
    ])


def _has_idempotency(src: str) -> bool:
    return _has_any(src, [
        r"\bidempotency[_-]?key\b",
        r"\bIdempotency-Key\b",
        r"\bdedup(licat|e)",
    ])


# ---------- Extraction ------------------------------------------------------

RPC_CALL_RE = re.compile(r"""\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]""")
TABLE_CALL_RE = re.compile(r"""\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]""")
FN_INVOKE_RE = re.compile(r"""functions\.invoke\(\s*['"`]([a-zA-Z0-9_\-]+)['"`]""")


def scan_function(fn_dir: Path) -> dict:
    src_files = list(fn_dir.rglob("*.ts"))
    src = "\n".join(f.read_text(encoding="utf-8", errors="ignore") for f in src_files)

    checks = {
        "structured_logs":   _has_structured_logs(src),
        "correlation_id":    _has_correlation_id(src),
        "request_id_header": _has_request_id_response(src),
        "tenant_logged":     _has_tenant_in_logs(src),
        "auth_uid_logged":   _has_auth_uid_in_logs(src),
        "duration_tracked":  _has_duration_tracking(src),
        "metrics":           _has_metrics(src),
        "error_structured":  _has_structured_errors(src),
        "audit_logging":     _has_audit(src),
        "timeout":           _has_timeout(src),
        "retry":             _has_retry(src),
        "circuit_breaker":   _has_circuit_breaker(src),
        "idempotency":       _has_idempotency(src),
    }

    rpcs   = sorted(set(RPC_CALL_RE.findall(src)))
    tables = sorted(set(TABLE_CALL_RE.findall(src)))
    return {"checks": checks, "rpcs": rpcs, "tables": tables, "loc": src.count("\n") + 1}


OBSERV_KEYS = [
    "structured_logs", "correlation_id", "request_id_header",
    "tenant_logged", "auth_uid_logged", "duration_tracked",
    "metrics", "error_structured", "audit_logging",
]
RELIABILITY_KEYS = ["timeout", "retry", "circuit_breaker", "idempotency"]


def classify(checks: dict) -> str:
    observ_present = sum(1 for k in OBSERV_KEYS if checks[k])
    n = len(OBSERV_KEYS)  # 9
    if observ_present == n:
        return "COMPLETE"
    if observ_present >= 6:
        return "PARTIAL"
    if observ_present >= 3:
        return "MINIMAL"
    return "NONE"


def scan_frontend_callers() -> dict[str, list[str]]:
    callers: dict[str, set[str]] = defaultdict(set)
    for root in FRONTEND_ROOTS:
        rpath = REPO / root
        if not rpath.exists():
            continue
        for path in rpath.rglob("*"):
            if not path.is_file() or path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for match in FN_INVOKE_RE.finditer(text):
                callers[match.group(1)].add(str(path.relative_to(REPO)))
    return {k: sorted(v) for k, v in callers.items()}


# ---------- Reporting -------------------------------------------------------

TICK = "✅"
CROSS = "—"


def cell(v: bool) -> str:
    return TICK if v else CROSS


def _git_head() -> str:
    try:
        r = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True)
        return r.stdout.strip()
    except Exception:
        return "(unknown)"


def _migration_head() -> str:
    m = REPO / "supabase/migrations"
    if not m.exists():
        return "(unknown)"
    files = sorted(p.name for p in m.glob("*.sql"))
    return files[-1] if files else "(none)"


def main() -> None:
    functions = sorted(
        d for d in FUNCTIONS_DIR.iterdir()
        if d.is_dir() and d.name not in SKIP_DIRS and (d / "index.ts").exists()
    )

    frontend_callers = scan_frontend_callers()
    results = {fn.name: scan_function(fn) for fn in functions}

    # Classification
    for name, r in results.items():
        r["status"] = classify(r["checks"])

    by_status = defaultdict(list)
    for name, r in results.items():
        by_status[r["status"]].append(name)

    # Gaps by category
    gaps: dict[str, list[str]] = defaultdict(list)
    for name, r in results.items():
        for k in OBSERV_KEYS + RELIABILITY_KEYS:
            if not r["checks"][k]:
                gaps[k].append(name)

    total = len(functions)

    out: list[str] = []
    out.append("# R1 — Observability Inventory (READ-ONLY)\n")
    out.append("## Provenance\n")
    out.append(f"- **Collected at:** `{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%SZ')}`")
    out.append(f"- **Commit SHA:** `{os.environ.get('GITHUB_SHA') or _git_head()}`")
    out.append(f"- **Migration head:** `{_migration_head()}`")
    out.append(f"- **Edge Functions scanned:** {total}")
    out.append(f"- **Generator:** `tools/reports/observability_inventory.py`")
    out.append(f"- **Scope:** static analysis of `supabase/functions/*/index.ts`. No runtime, no DB queries, no code changes.\n")

    out.append("## Executive summary\n")
    out.append("```")
    out.append(f"Edge Functions: {total}\n")
    for status in ["COMPLETE", "PARTIAL", "MINIMAL", "NONE"]:
        out.append(f"{status}:")
        out.append(f"  {len(by_status.get(status, []))}\n")
    out.append("```")

    out.append("\n## Classification rules (deterministic)\n")
    out.append("A function is scored across 9 observability signals. Reliability signals")
    out.append("are inventoried but **not** used for classification (per R1 scope).\n")
    out.append("| Status   | Rule                                          |")
    out.append("|----------|-----------------------------------------------|")
    out.append("| COMPLETE | 9 of 9 observability signals present          |")
    out.append("| PARTIAL  | 6–8 signals present                           |")
    out.append("| MINIMAL  | 3–5 signals present                           |")
    out.append("| NONE     | 0–2 signals present                           |")

    out.append("\n## Detection heuristics (documented, so a reader can spot false negatives)\n")
    out.append("| Signal              | Positive when the source contains …                                          |")
    out.append("|---------------------|------------------------------------------------------------------------------|")
    out.append("| structured_logs     | import of `_shared/logger`, `logger.<level>(...)`, or `loggerWithContext(...)` |")
    out.append("| correlation_id      | `X-Request-ID` header, `requestId`, or `correlation_id` token                 |")
    out.append("| request_id_header   | function reads/echoes `x-request-id` / `x-trace-id` header                    |")
    out.append("| tenant_logged       | tenantId passed into logger context or log payload                            |")
    out.append("| auth_uid_logged     | userId/uid passed into logger context or log payload                          |")
    out.append("| duration_tracked    | explicit `duration_ms`, or `start = Date.now()` … `Date.now() - start`        |")
    out.append("| metrics             | import of `_shared/apm`, `recordMetric(...)`, or writes to `performance_metrics` / `edge_function_metrics` |")
    out.append("| error_structured    | `logger.error(...)` is used; a function that only has `console.error` fails   |")
    out.append("| audit_logging       | import of `_shared/audit`, `createAuditLog(...)`, or writes to `audit_logs`   |")
    out.append("| timeout             | `AbortSignal.timeout(...)` or `new AbortController()`                         |")
    out.append("| retry               | `retry:` / `maxRetries` / `attempt <` / `backoff`                             |")
    out.append("| circuit_breaker     | import of `ai-circuit-breaker`, or `circuit_breaker` token                    |")
    out.append("| idempotency         | `idempotency_key`, `Idempotency-Key` header, or `dedup*`                      |")

    # Coverage matrix
    out.append("\n## Coverage matrix\n")
    out.append("Observability (used for classification):")
    out.append("")
    header = ["Function", "Status", "logs", "corrId", "reqIdHdr", "tenant", "uid", "duration", "metrics", "errLog", "audit"]
    out.append("| " + " | ".join(header) + " |")
    out.append("|" + "|".join(["---"] * len(header)) + "|")
    for name in sorted(results):
        r = results[name]
        c = r["checks"]
        out.append("| `{}` | **{}** | {} | {} | {} | {} | {} | {} | {} | {} | {} |".format(
            name, r["status"],
            cell(c["structured_logs"]), cell(c["correlation_id"]), cell(c["request_id_header"]),
            cell(c["tenant_logged"]), cell(c["auth_uid_logged"]), cell(c["duration_tracked"]),
            cell(c["metrics"]), cell(c["error_structured"]), cell(c["audit_logging"]),
        ))

    out.append("\nReliability metadata (inventoried only, not scored):\n")
    rh = ["Function", "timeout", "retry", "circuit_breaker", "idempotency"]
    out.append("| " + " | ".join(rh) + " |")
    out.append("|" + "|".join(["---"] * len(rh)) + "|")
    for name in sorted(results):
        c = results[name]["checks"]
        out.append("| `{}` | {} | {} | {} | {} |".format(
            name,
            cell(c["timeout"]), cell(c["retry"]), cell(c["circuit_breaker"]), cell(c["idempotency"]),
        ))

    # Gaps
    out.append("\n## Gaps by category\n")
    out.append("Grouped enumeration only — R1 does not propose remediation.\n")
    gap_labels = {
        "structured_logs":   "Functions without structured logger",
        "correlation_id":    "Functions without correlation ID",
        "request_id_header": "Functions that do not read/echo request-id header",
        "tenant_logged":     "Functions not logging tenant_id",
        "auth_uid_logged":   "Functions not logging auth uid / user_id",
        "duration_tracked":  "Functions without duration tracking",
        "metrics":           "Functions without metrics (APM / performance_metrics)",
        "error_structured":  "Functions without structured error logging (`logger.error`)",
        "audit_logging":     "Functions without audit logging",
        "timeout":           "Functions without fetch timeout / AbortController",
        "retry":             "Functions without retry logic",
        "circuit_breaker":   "Functions without circuit breaker",
        "idempotency":       "Functions without idempotency signal",
    }
    for key in OBSERV_KEYS + RELIABILITY_KEYS:
        names = gaps.get(key, [])
        out.append(f"### {gap_labels[key]} ({len(names)}/{total})\n")
        if not names:
            out.append("_None._\n")
        else:
            out.append(", ".join(f"`{n}`" for n in names))
            out.append("")

    # Call graph
    out.append("\n## Call graph (frontend → function → RPC / table)\n")
    out.append("Static extraction. `callers` are files under " + ", ".join(f"`{r}/`" for r in FRONTEND_ROOTS)
               + " that invoke the function via `supabase.functions.invoke('<name>')`."
               + " `rpcs` and `tables` are extracted from the function's own source.\n")
    out.append("| Function | Callers | RPCs called | Tables touched |")
    out.append("|----------|--------:|-------------|----------------|")
    for name in sorted(results):
        r = results[name]
        callers = frontend_callers.get(name, [])
        callers_cell = f"{len(callers)}" + (
            f" · e.g. `{callers[0]}`" if callers else " · —"
        )
        rpcs_cell = ", ".join(f"`{x}`" for x in r["rpcs"][:6]) or "—"
        if len(r["rpcs"]) > 6:
            rpcs_cell += f" (+{len(r['rpcs']) - 6})"
        tables_cell = ", ".join(f"`{x}`" for x in r["tables"][:6]) or "—"
        if len(r["tables"]) > 6:
            tables_cell += f" (+{len(r['tables']) - 6})"
        out.append(f"| `{name}` | {callers_cell} | {rpcs_cell} | {tables_cell} |")

    # Status listings
    out.append("\n## Functions grouped by status\n")
    for status in ["COMPLETE", "PARTIAL", "MINIMAL", "NONE"]:
        names = sorted(by_status.get(status, []))
        out.append(f"### {status} ({len(names)})\n")
        if not names:
            out.append("_None._\n")
        else:
            out.append(", ".join(f"`{n}`" for n in names))
            out.append("")

    # Scope reminder
    out.append("\n## R1 closure contract\n")
    out.append("This artifact satisfies the four deliverables authorized for R1:\n")
    out.append("1. ✅ Executive summary (COMPLETE / PARTIAL / MINIMAL / NONE counts).")
    out.append("2. ✅ Complete matrix, one row per function.")
    out.append("3. ✅ Gaps grouped by category, no remediation proposed.")
    out.append("4. ✅ Call graph (frontend → function → RPC → table).")
    out.append("")
    out.append("**Not included (out of scope, per authorization):** scores, rankings, PRs,")
    out.append("hotfixes, standardization, refactors, instrumentation, or any code change")
    out.append("in the functions themselves. Reliability Score remains **blocked** and must")
    out.append("not be produced from this data until R2 is authorized.")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")

    # Print short summary to stdout for CLI use.
    summary = {
        "total": total,
        "COMPLETE": len(by_status.get("COMPLETE", [])),
        "PARTIAL":  len(by_status.get("PARTIAL", [])),
        "MINIMAL":  len(by_status.get("MINIMAL", [])),
        "NONE":     len(by_status.get("NONE", [])),
        "output":   str(OUTPUT_PATH.relative_to(REPO)),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
