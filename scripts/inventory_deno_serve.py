#!/usr/bin/env python3
"""
Inventory all Deno.serve() edge functions and classify by migration eligibility.
Usage: python3 scripts/inventory_deno_serve.py [root_dir]
Output: CSV to stdout
"""
import csv
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "supabase/functions"

PATTERNS = {
    "hmac": [
        r"verifyHmac", r"X-HMAC", r"X-Hmac", r"\bHMAC\b",
        r"timingSafeEqual", r"hmac_secret", r"authenticateAgent",
    ],
    "raw-body": [
        r"arrayBuffer\(", r"req\.text\(", r"req\.clone\(\)\.text\(",
        r"rawBody", r"raw.?body",
    ],
    "legacy": [
        r"\blegacy\b", r"backward.?compat", r"older agents",
    ],
}


def classify(text: str) -> str:
    for label, patterns in PATTERNS.items():
        for p in patterns:
            if re.search(p, text, re.IGNORECASE):
                return label
    return "migratable"


rows = []
for entry in sorted(os.listdir(ROOT)):
    idx = os.path.join(ROOT, entry, "index.ts")
    if not os.path.isfile(idx):
        continue
    with open(idx, "r", encoding="utf-8") as f:
        text = f.read()
    if "Deno.serve" not in text:
        continue
    reason = classify(text)
    lines = text.count("\n") + 1
    uses_middleware = any(m in text for m in ["serveTenant", "servePublic", "serveAgent", "serveInternal"])
    rows.append({
        "reason": reason,
        "function": entry,
        "lines": lines,
        "uses_middleware": uses_middleware,
    })

rows.sort(key=lambda r: (r["reason"], r["function"]))

writer = csv.DictWriter(sys.stdout, fieldnames=["reason", "function", "lines", "uses_middleware"])
writer.writeheader()
writer.writerows(rows)
