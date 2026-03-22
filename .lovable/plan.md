

## Plan: Hardening Anti-C2, Anti-Ransomware & Anti-RAT

Three actions to protect pcteste1 and the fleet against the threat vectors identified in the incident.

---

### 1. DNS Filter — Block Known C2/Malware Domains

**Current state**: Only social media sites blocked (facebook, tiktok). Zero C2/malware domains.

**Action**: Insert ~40 known C2/malware domain patterns via database migration into `blocked_websites` table, then trigger sync to agents.

Domains to add (categorized):
- **C2 Frameworks**: `*.cobaltstrikeserver.com`, `*.metasploit.com`, `*.covenant.dev`
- **Dynamic DNS (common RAT C2)**: `*.no-ip.com`, `*.duckdns.org`, `*.ddns.net`, `*.dynu.com`, `*.freedns.afraid.org`, `*.hopto.org`, `*.zapto.org`, `*.serveo.net`, `*.ngrok.io`, `*.ngrok-free.app`, `*.localhost.run`, `*.trycloudflare.com`
- **Known Malware Distribution**: `*.pastebin.com` (exfil), `*.anonfiles.com`, `*.mega.nz` (exfil)
- **Tor Exit/Proxy**: `*.torproject.org`, `*.onion.ws`, `*.onion.to`
- **Cryptomining**: `*.coinhive.com`, `*.minero.cc`, `*.cryptoloot.pro`
- **Known Abuse**: `*.temp.sh`, `*.transfer.sh`, `*.file.io`, `*.catbox.moe`

Each entry gets `reason: 'Proteção C2/Malware — Bloqueio automático pós-incidente'`.

**File**: New SQL migration

---

### 2. Detection Rules — Ransomware-Specific Rules

**Current state**: Has `Shadow Copy Deletion` (T1490) and `Ransomware File Rename Pattern` (T1486). Missing key ransomware behaviors.

**New global rules to add** (6 rules):

| Rule | Event Type | MITRE | Severity |
|------|-----------|-------|----------|
| Mass File Encryption Detection | file | T1486 | critical |
| Ransom Note Creation | file | T1486 | critical |
| BCDEdit Boot Config Modification | process | T1490 | critical |
| Volume Shadow Service Tampering | process | T1490 | critical |
| WMI Shadow Copy Deletion | process | T1490 | critical |
| Backup Software Termination | process | T1489 | high |

Each rule includes `rule_logic` JSON with detection patterns (e.g., `bcdedit.*recoveryenabled.*no`, `readme.*ransom|decrypt.*files`).

**MITRE seed**: Add `T1489` (Service Stop) which is missing from the techniques table.

---

### 3. Detection Rules — RAT-Specific Rules

**New global rules** (6 rules):

| Rule | Event Type | MITRE | Severity |
|------|-----------|-------|----------|
| Known RAT Process Detection | process | T1219 | critical |
| RAT Persistence via Registry | registry | T1547.001 | high |
| Keylogger Activity Detection | process | T1056.001 | critical |
| Screen Capture Tool Execution | process | T1113 | high |
| Reverse Proxy / SOCKS Detection | network | T1090 | high |
| Suspicious Remote Desktop Tool | process | T1219 | high |

**MITRE seed**: Add `T1219` (Remote Access Software), `T1056.001` (Keylogging), `T1113` (Screen Capture), `T1090` (Proxy), `T1489` (Service Stop) to techniques table.

---

### Technical Details

**Single migration** with:
1. `INSERT INTO mitre_attack_techniques` — 5 new techniques (ON CONFLICT DO NOTHING)
2. `INSERT INTO detection_rules` — 12 new global rules (tenant_id = NULL)
3. `INSERT INTO blocked_websites` — ~30 C2 domains for each existing tenant

For `blocked_websites`, the migration will insert for all tenants:
```sql
INSERT INTO blocked_websites (tenant_id, domain_pattern, reason, is_active)
SELECT t.id, d.pattern, d.reason, true
FROM tenants t
CROSS JOIN (VALUES ('*.no-ip.com', 'C2/Malware'), ...) AS d(pattern, reason)
ON CONFLICT DO NOTHING;
```

**No code changes needed** — existing hooks (`useBlockedWebsites`, `useDetectionRules`) already display these records automatically.

**Files modified**: 1 new SQL migration only.

