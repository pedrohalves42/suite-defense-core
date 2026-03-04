
Objetivo imediato (definitivo): parar a reativação do firewall no MIT-SERVIDOR e encerrar o erro `first_seen` sem depender de injeção frágil de hotfix.

Diagnóstico confirmado
- O agente recebeu force update (SHA validado), mas continua reativando firewall.
- O release ativo `v5.0.13` no banco ainda está desalinhado do script canônico: ele tem `HOTFIX-SKIP-FW-GUARD`, mas NÃO tem o bloco de leitura da flag do heartbeat (`$response.skip_firewall_remediation`) persistido corretamente.
- Resultado: o guard existe, porém `$Global:SkipFirewallRemediation` fica `false`, então a remediação continua.
- O erro `first_seen` persiste por baseline legado/corrompido + lógica antiga ainda em produção.

Plano de correção (implementação)
1) Corrigir no script base (não só hotfix runtime)
- Arquivo: `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v5.ps1`
- Garantir 3 blocos nativos no v5.0.13:
  1. Init robusto de `$Global:SkipFirewallRemediation` (C:\CyberShield\skip_firewall.flag e `$PSScriptRoot`).
  2. Aplicação do valor vindo do heartbeat (`skip_firewall_remediation`) + persistência da flag em disco.
  3. Guard no `Test-FirewallStatus` ANTES de qualquer `Set-NetFirewallProfile`, retornando `skipped_external`.

2) Corrigir baseline `first_seen` no script base
- No `Initialize-ProcessBaseline`/`Get-ProcessAnomalies`:
  - parser resiliente do JSON de baseline;
  - auto-heal: se JSON estiver inválido/duplicado, renomear baseline corrompido e recriar;
  - inserção idempotente (não duplicar estrutura de processo já existente).

3) Reduzir risco de regressão no injetor
- Arquivo: `supabase/functions/_shared/windows-script-hotfix.ts`
- Manter hotfix como fallback, mas deixar explícito que para v5.0.13 os blocos acima devem existir no script base.
- Adicionar validação de marcadores obrigatórios antes de entregar force update (se faltar marcador crítico, logar e bloquear entrega daquele release).

4) Tornar o banco a fonte correta (authoritative)
- Sincronizar o script corrigido para `agent_releases` (v5.0.13 windows), recalcular `sha256`, manter assinatura.
- Validar no banco presença obrigatória:
  - lógica heartbeat `skip_firewall_remediation`,
  - guard de firewall,
  - auto-heal de baseline.

5) Reentrega controlada ao MIT-SERVIDOR
- Reativar `force_update_at` para MIT-SERVIDOR.
- Manter trigger atual (clear só em mudança real de versão/confirm).
- Confirmar que o agente fez download do novo SHA e reiniciou com script atualizado.

Validação de sucesso (obrigatória)
- Logs devem mostrar:
  - `skip_firewall_remediation=true` aplicado no runtime;
  - `Firewall ... Skipping remediation` (INFO);
  - ausência total de `AUTO-REMEDIATE Firewall re-enabled...`;
  - desaparecimento de `chave ... 'first_seen'`.
- Estado operacional:
  - sem queda de conectividade por firewall;
  - heartbeat e poll-jobs estáveis.

Detalhes técnicos (para execução)
- Arquivos-alvo:
  - `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v5.ps1`
  - `supabase/functions/_shared/windows-script-hotfix.ts`
  - endpoint de sync de release usado no projeto (`sync-agent-release-content`/equivalente)
- Query de validação pós-deploy:
  - checar `agent_releases.script_content` com `position(...)` dos marcadores críticos.
- Rollback:
  - restaurar script anterior no release + limpar `force_update_*` apenas do MIT se qualquer regressão aparecer.
