

# Plano: Corrigir MIT-SERVIDOR - Firewall sendo reativado pelo agente

## Problema Raiz

O agente v5.0.13 tem a função `Test-FirewallStatus` que **sempre reativa o Windows Firewall** quando detecta profiles desabilitados. Embora exista a flag `skip_firewall_remediation = true` no banco de dados para o MIT-SERVIDOR, e hotfixes (24a/24b) para persistir essa flag localmente, **nenhum hotfix injeta a verificação dessa flag dentro da função `Test-FirewallStatus`**.

Resultado: a cada 5 minutos, o agente detecta o firewall desligado, reativa ele, e derruba a internet do servidor (que usa firewall externo pfSense).

## Solução

Adicionar um **HOTFIX 24d** no arquivo `windows-script-hotfix.ts` que injeta uma verificação de `$Global:SkipFirewallRemediation` no início do bloco de auto-remediação dentro de `Test-FirewallStatus`, **antes** do `Set-NetFirewallProfile`.

### Arquivo: `supabase/functions/_shared/windows-script-hotfix.ts`

**Novo HOTFIX 24d** — Injetar guard no `Test-FirewallStatus`:

Buscar o padrão no script:
```
# AUTO-REMEDIATION: Re-enable disabled firewall profiles
$remediated = @()
foreach ($profileName in $disabledProfiles) {
```

Substituir por:
```
# AUTO-REMEDIATION: Re-enable disabled firewall profiles
# HOTFIX-SKIP-FW-GUARD: Skip remediation if external firewall flag is set
if ($Global:SkipFirewallRemediation) {
    Write-Log "[LOCAL-DETECT] Firewall disabled but skip_firewall_remediation=true (external firewall). Skipping remediation." "INFO"
    # Still alert but mark as external_firewall, not auto-remediated
    Invoke-PushAlert -AlertType "firewall_disabled" -AlertMessage "Firewall desativado em $env:COMPUTERNAME (profiles: $($disabledProfiles -join ', ')). Remediação pulada: firewall externo." -Severity "info" -Details @{ disabled_profiles = $disabledProfiles; skip_reason = "external_firewall"; auto_remediated = $false }
    return @{ status = "skipped_external"; disabled_profiles = $disabledProfiles }
}
$remediated = @()
foreach ($profileName in $disabledProfiles) {
```

Também garantir que a variável `$Global:SkipFirewallRemediation` é **inicializada** no script mesmo que não exista no base. Adicionar um **HOTFIX 24e** que injeta a inicialização caso não exista:

Se o script contém `Test-FirewallStatus` mas NÃO contém `$Global:SkipFirewallRemediation`, injetar a declaração + flag file loader logo antes de `Invoke-LocalDetection`.

### Também necessário no mesmo hotfix:

Baixar a severidade do alerta `firewall_disabled` de `critical` para `info` quando `skip_firewall_remediation` está ativo, evitando poluição do journal com alertas críticos a cada 5 minutos.

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/_shared/windows-script-hotfix.ts` | Adicionar HOTFIX 24d (guard no Test-FirewallStatus) + HOTFIX 24e (init da variável global) |

Após deploy, o MIT-SERVIDOR receberá o script corrigido no próximo heartbeat (até 2 minutos) e parará de reativar o Windows Firewall.

