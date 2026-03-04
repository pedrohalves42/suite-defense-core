
Objetivo: parar definitivamente a reativação do firewall no MIT-SERVIDOR e eliminar o erro de baseline `first_seen` sem depender de comandos manuais recorrentes.

Resumo do diagnóstico (confirmado no backend):
1) O agente MIT-SERVIDOR está com `skip_firewall_remediation = true`, mas o script ativo em `agent_releases` (v5.0.13) NÃO contém:
   - `HOTFIX-SKIP-FW-GUARD`
   - `HOTFIX-SKIP-FW-BOOT/PERSIST`
   - `HOTFIX-BASELINE-DEDUP`
2) O script em código-fonte (`_shared/agent-scripts/cybershield-agent-windows-v5.ps1`) já tem lógica de skip firewall; o problema é sincronização/entrega do script que ficou defasado no banco.
3) O endpoint `heartbeat` entrega force update direto do `agent_releases` sem aplicar hotfix runtime (ao contrário de `serve-agent-update`), então agentes podem continuar recebendo script “antigo”.
4) O trigger `trg_auto_clear_force_update` ainda está permissivo demais (limpa flags só por igualdade de versão), o que fragiliza re-push de hotfix same-version.
5) O 403 de DNS no log (`DNS Filter desabilitado`) é esperado/feature-flag e não é a causa da queda de internet.

Plano de implementação:

Fase 1 — Correção da entrega de script (principal)
1. Atualizar `supabase/functions/heartbeat/index.ts`:
   - Importar e aplicar `applyWindowsScriptHotfix()` no `release.script_content` dentro do branch de `force_update`.
   - Persistir `script_content` hotfixado em `agent_releases` (best-effort), igual já é feito em `serve-agent-update`.
2. Atualizar `supabase/functions/agent-heartbeat/index.ts` (proxy legado):
   - Mesma lógica acima no retorno de force update, para não haver caminho legado entregando script sem hotfix.

Fase 2 — Hardening do injetor de hotfix
3. Ajustar `supabase/functions/_shared/windows-script-hotfix.ts`:
   - Tornar HOTFIX 24d/24e resilientes quando o script base não tem exatamente os padrões esperados.
   - Garantir fallback de injeção por blocos alternativos (não só regex estrita de comentário/linha).
   - Garantir que, se `Test-FirewallStatus` existir e `SkipFirewallRemediation` não existir, a variável seja sempre inicializada antes do uso.
4. Fortalecer HOTFIX 32 (baseline) para cobrir variantes reais do trecho que gera `first_seen` duplicado e manter fallback com try/catch não-fatal em `Detect-ProcessAnomalies`.

Fase 3 — Banco de dados (confiabilidade de re-push)
5. Criar migração SQL para substituir a função do trigger `auto_clear_force_update_on_match`:
   - Só limpar `force_update_*` quando houver mudança real de versão (`NEW.agent_version IS DISTINCT FROM OLD.agent_version`) e match com target.
   - Evitar limpeza prematura em cenários de hotfix same-version.
6. Criar migração SQL de re-disparo:
   - Reativar `force_update_version='v5.0.13'`, `force_update_at=now()` para MIT-SERVIDOR (e opcionalmente outros agentes críticos com mesmo sintoma), com motivo explícito de emergency hotfix.

Fase 4 — Validação operacional
7. Validar no banco que `agent_releases.script_content` ativo passou a conter:
   - `HOTFIX-SKIP-FW-GUARD`
   - `HOTFIX-SKIP-FW-BOOT`/`HOTFIX-SKIP-FW-PERSIST` (ou init equivalente)
   - `HOTFIX-BASELINE-DEDUP`
8. Validar logs do MIT após novo heartbeat:
   - Deve aparecer “skip firewall remediation” (INFO),
   - Não deve mais aparecer `AUTO-REMEDIATE Firewall re-enabled...`,
   - Não deve mais alternar `ENFORCING -> DEGRADED` logo após detecção de firewall,
   - Erro `first_seen` deve desaparecer.
9. Critério de sucesso:
   - Firewall permanece desativado (quando ambiente externo/pfSense exige),
   - Conectividade não cai,
   - Agente continua batendo heartbeat normalmente.

Detalhes técnicos (para implementação)
- Arquivos-alvo:
  - `supabase/functions/heartbeat/index.ts`
  - `supabase/functions/agent-heartbeat/index.ts`
  - `supabase/functions/_shared/windows-script-hotfix.ts`
  - nova migration SQL para função/trigger + nova migration SQL para force update
- Risco principal:
  - regex de injeção frágil; mitigação: fallback por múltiplos padrões + validação por marcador.
- Estratégia de rollback:
  - manter versão atual e apenas limpar `force_update_*` dos agentes afetados se qualquer regressão for detectada.

