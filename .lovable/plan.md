

# Diagnóstico definitivo: Por que o agente CRASH após force update

## Causa raiz confirmada

O script base (`cybershield-agent-windows-v5.ps1`) já tem **TODA a lógica correta** nativamente:
- Boot init com `C:\CyberShield\skip_firewall.flag` (linha 636-649)
- Heartbeat reader de `skip_firewall_remediation` (linha 4480-4503)
- Guard no `Test-FirewallStatus` com triple-check (linha 4797-4841)
- Baseline dedup com HashSet (linha 3600-3624)

**MAS** o script NÃO tem os comentários-marcador (`HOTFIX-SKIP-FW-BOOT`, `HOTFIX-SKIP-FW-GUARD`, etc.).

Quando o heartbeat entrega o script, `applyWindowsScriptHotfix()` não encontra os marcadores → dispara TODOS os HOTFIXes 24a/24b/24d/24e/24h/32 → injeta código DUPLICADO com escaping incorreto (`\\$shouldSkipFw` vira `\$shouldSkipFw` no PowerShell = **erro de sintaxe fatal**) → agente crashou silenciosamente após 11:20.

## Plano de correção (3 passos)

### 1. Adicionar marcadores ao script base (.ps1)

Arquivo: `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v5.ps1`

Alterações mínimas — apenas adicionar comentários-marcador nas linhas corretas para que o injector PULE esses blocos:

| Linha | Antes | Depois |
|-------|-------|--------|
| 635 | `# DEFINITIVE FIX: Use hardcoded C:\CyberShield...` | `# HOTFIX-SKIP-FW-BOOT: Use hardcoded C:\CyberShield...` |
| 643 | `Write-Log "[CONFIG] skip_firewall...` | Remover (Write-Log antes da definição da função) |
| 4477 | `# AGENT CONFIG FLAGS (v5.0.13)` | `# HOTFIX-SKIP-FW-HEARTBEAT-READ: AGENT CONFIG FLAGS (v5.0.13)` |
| 4482 | `# DEFINITIVE FIX: Persist to HARDCODED...` | `# HOTFIX-SKIP-FW-PERSIST: Persist to HARDCODED...` |
| 4793 | `# DEFINITIVE FIX: Triple-check skip flag...` | `# HOTFIX-SKIP-FW-GUARD: Triple-check skip flag...` |
| 4825 | `# DEFINITIVE: If skip flag is active...` | `# HOTFIX-SKIP-FW-GUARD: If skip flag is active...` |
| 3593 | synopsis comment | Adicionar `HOTFIX-BASELINE-DEDUP` no docstring |
| 3647 | `first_seen = (Get-Date)...` | Adicionar `<# HOTFIX-BASELINE-DEDUP #>` |

Também adicionar `HOTFIX-SKIP-FW-INIT` como comentário perto da declaração da variável para evitar HOTFIX 24e.

### 2. Corrigir escaping no hotfix injector (prevenção futura)

Arquivo: `supabase/functions/_shared/windows-script-hotfix.ts`

Os HOTFIX 24d estratégia 2/3 (linhas 923-942) usam `\\$shouldSkipFw` e `\\$Global:` nos replacement strings. No JavaScript `.replace()`, `\\` é literal backslash, produzindo `\$shouldSkipFw` no PowerShell — sintaxe inválida.

Correção: remover os `\\` extras nos replacement strings das estratégias 2 e 3 do HOTFIX 24d. Embora com os marcadores esses blocos não devam mais disparar, é importante corrigir para scripts legados.

### 3. Migração SQL: re-sync e force update

Duas migrações:
1. **Substituir o script inteiro** no `agent_releases` pelo conteúdo correto com marcadores. Recalcular SHA256.
2. **Reset force_update** para MIT-SERVIDOR com motivo "HOTFIX-MARKERS: prevent duplicate injection crash".

## Por que esta correção é definitiva

- Com os marcadores, `applyWindowsScriptHotfix()` verá `HOTFIX-SKIP-FW-BOOT`, `HOTFIX-SKIP-FW-GUARD`, etc. e **pulará** todos esses blocos
- Zero injeção = zero código duplicado = zero erro de sintaxe = agente inicia normalmente
- A lógica nativa do script base (que já está correta) roda sem interferência
- O `skip_firewall.flag` já está criado no disco (comando manual executado)
- No próximo heartbeat, o agente receberá o script limpo, iniciará sem crash, lerá a flag do disco, e **não reativará o firewall**

