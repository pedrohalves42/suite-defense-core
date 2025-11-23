# ASCII Enforcement Policy

## Why ASCII-Only?

PowerShell 5.1 (default on Windows Server 2016-2019) cannot parse scripts with:
- Emojis (wrench, checkmark, cross mark, warning, etc.)
- Portuguese accents (a, e, c, a, etc.)
- Smart quotes (" " ' ')
- Special symbols (arrow, bullet, etc.)

Parsing failures result in agents that never start, causing:
- No folder creation (C:\CyberShield)
- No log files
- Failed Scheduled Tasks
- Agents stuck in "pending" status
- No heartbeats

## Tools

### ascii:check
Scans repository for non-ASCII characters in target files.

```bash
npm run ascii:check
```

**Exit Codes:**
- 0: All files are ASCII-safe
- 1: Non-ASCII characters found

**Target Extensions:**
- .ps1 (PowerShell scripts)
- .psm1 (PowerShell modules)
- .ts, .tsx (TypeScript)
- .sql (Database migrations)
- .psd1 (PowerShell data files)

### ascii:fix
Automatically rewrites files to remove non-ASCII characters.

```bash
npm run ascii:fix
```

**What it does:**
- Replaces emojis with ASCII tags
- Removes accents from Portuguese characters
- Converts smart quotes to standard quotes
- Replaces special symbols with ASCII equivalents

### Core Script
`tools/ascii-guard.ts` - Main sanitization engine

## Character Replacement Map

### Emojis
| Original | Replacement | Context |
|----------|-------------|---------|
| wrench   | `[JOB]`     | Job execution logs |
| cross    | `[ERROR]`   | Error messages |
| check    | `[OK]`      | Success messages |
| warning  | `[WARN]`    | Warning messages |
| mailbox1 | `[POLL]`    | Job polling |
| mailbox2 | `[MAIL]`    | Job received |
| package  | `[PKG]`     | Package operations |
| doc      | `[DOC]`     | Document operations |
| search   | `[SCAN]`    | Scan operations |

### Portuguese Accents
| Original | Replacement |
|----------|-------------|
| a        | a           |
| e        | e           |
| c        | c           |
| a        | a           |
| o        | o           |
| u        | u           |
| A        | A           |
| E        | E           |
| C        | C           |

### Special Characters
| Original | Replacement |
|----------|-------------|
| arrow    | `->`        |
| bullet   | `-`         |
| " "      | `" "`       |
| ' '      | `' '`       |

## CI/CD Protection

The `guardian` job in `.github/workflows/e2e-tests.yml` runs `ascii:check` on every push/PR.

**Workflow:**
1. Install dependencies
2. **Run ASCII Guard** (blocks non-ASCII)
3. Run system validation
4. Continue with tests

**Result:** Any commit with non-ASCII characters in target files will fail CI.

## Usage Workflow

### After Modifying Agent Scripts

1. Edit `public/agent-scripts/cybershield-agent-windows-v3.ps1`
2. Run ASCII check:
   ```bash
   npm run ascii:check
   ```
3. If issues found, auto-fix:
   ```bash
   npm run ascii:fix
   ```
4. Sync to embedded version:
   ```bash
   npm run sync:agent
   ```
5. Validate sync:
   ```bash
   npm run validate:sync
   ```
6. Commit changes

### After Modifying Installer Template

1. Edit `supabase/functions/_shared/installer-template.ts`
2. Run ASCII check:
   ```bash
   npm run ascii:check
   ```
3. If issues found, auto-fix:
   ```bash
   npm run ascii:fix
   ```
4. Redeploy Edge Function:
   - Via Lovable Cloud UI, or
   - Automatic on git push
5. Commit changes

## Ignored Directories

The ASCII guard skips these directories:
- `node_modules`
- `.git`
- `.turbo`
- `dist`
- `build`
- `.next`
- `.vercel`

## Trade-offs

### Readability
Portuguese logs without accents are less elegant:
- `disponivel` vs `disponivel`
- `concluido` vs `concluido`
- `critico` vs `critico`

**Decision:** Universal compatibility > linguistic elegance

### Emoji Visual Appeal
Emojis provide quick visual parsing in logs, but:
- PowerShell 5.1 cannot parse them
- Windows Server environments are conservative
- ASCII tags are unambiguous

**Decision:** Functionality > aesthetics

## Validation Checklist

Before deploying agent updates:

- [ ] `npm run ascii:check` passes
- [ ] `npm run sync:agent` completed
- [ ] `npm run validate:sync` shows no diff
- [ ] Edge Functions redeployed
- [ ] Test installer generated
- [ ] Pre-installation validation on Windows VM:
  - [ ] PowerShell 5.1 syntax valid
  - [ ] No non-ASCII characters
  - [ ] Critical functions present
  - [ ] Jobs v3 compatible (StartedAt parameter)
- [ ] Post-installation validation:
  - [ ] C:\CyberShield folder created
  - [ ] Agent script file created
  - [ ] Logs created with expected content
  - [ ] Scheduled Task created with LastTaskResult = 0
  - [ ] Agent status = Active on dashboard
  - [ ] Heartbeat received within 2 minutes

## Troubleshooting

### "ascii:check failed in CI"
**Cause:** Commit contains non-ASCII characters

**Solution:**
1. Run locally: `npm run ascii:fix`
2. Review changes: `git diff`
3. Commit fixed files
4. Push again

### "Agent script not parsing on Windows VM"
**Cause:** Non-ASCII characters in deployed script

**Solution:**
1. Download installer from dashboard
2. Check for non-ASCII: `[System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($path)) -match '[^\x00-\x7F]'`
3. If found, re-run ASCII fix and redeploy:
   ```bash
   npm run ascii:fix
   npm run sync:agent
   # Redeploy serve-installer Edge Function
   ```

### "Scheduled Task fails immediately"
**Cause:** May be argument escaping, not ASCII

**Solution:**
1. Check Task Scheduler → CyberShieldAgent-X → Actions
2. Verify arguments use backtick escaping: `-File "C:\...\script.ps1" -AgentName \`"...\`"`
3. If malformed, regenerate installer with latest template

## Related Documentation

- `TESTING_GUIDE.md` - E2E testing procedures
- `VALIDATION_GUIDE.md` - Manual validation steps
- `scripts/verificar-installer-agente.ps1` - Local installer validation script
- `tools/validate-system.ts` - System health validation

## History

- **2024-11-23 (v3.3.1-PAYLOAD-FIX)**: Critical HMAC payload syntax fix
  - Fixed InvalidVariableReferenceWithDrive error in agent script
  - Replaced `$payload = "$timestamp:$nonce:$bodyJson"` with `'{0}:{1}:{2}' -f $timestamp, $nonce, $bodyJson`
  - PowerShell 5.1 was interpreting `:$` as drive reference (C:, D:, etc.)
  - Fixed 103 non-ASCII occurrences in scripts/test-v3-2-4-unblock-fix.ps1 (Portuguese accents, emojis)
  - Fixed 1 critical character in installer-template.ts line 329 (character 'a')
  - All files now 100% ASCII-compliant

- **2024-11**: Initial implementation
  - Created `tools/ascii-guard.ts`
  - Added CI protection
  - Fixed agent-script-windows-content.ts (3 emoji instances)
  - Fixed installer-template.ts (multiple emoji instances)
  - All PowerShell scripts now 100% ASCII-safe
