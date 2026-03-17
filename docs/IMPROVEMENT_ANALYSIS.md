# Análise de Melhorias do Sistema CyberShield

**Data**: 2026-03-17  
**Escopo**: Frontend, Edge Functions, Database Queries, Segurança

---

## 1. Problemas Existentes

### 1.1 Type Safety Comprometida — 1.121 `as any` em 118 arquivos

**Impacto**: Risco de quebra silenciosa em refactoring, possível vazamento cross-tenant.

| Categoria | Arquivos | Exemplos |
|-----------|----------|----------|
| Views não tipadas no schema | 5 hooks | `v_incident_groups`, `insight_feedback_quality` |
| Supabase client cast | 3 | `ComplianceAutomation.tsx`, `useAgentHealthAlerts.ts` |
| jsPDF `lastAutoTable` | 6+ | `SecurityAuditReport.tsx` |
| Badge variant cast | 10+ | `SecurityDashboard.tsx` |
| Realtime payload cast | 2 | `NotificationSystem.tsx` |

**Status**: ✅ Corrigidos `useAgentHealthAlerts.ts` e `ComplianceAutomation.tsx` nesta sessão.

### 1.2 Queries com `select('*')` — 330 ocorrências em 42 hooks

**Impacto**: Viola o padrão de payload minimization (ADR), transfere campos pesados desnecessários.

| Hook | Tabela | Campos desnecessários transferidos |
|------|--------|------------------------------------|
| `useForensicSnapshots` | `forensic_snapshots` | `snapshot_data` (JSON pesado) |
| `useAgentLifecycle` | `v_agent_lifecycle_state` | Todos os campos |
| `useSecurityPolicies` | `security_policies` | `policy_rules` (JSON) |
| `useSiemExport` | `siem_export_history` | `export_data` |
| `useDetectionRules` | `detection_rules` | `rule_logic` (JSON) |

**Recomendação**: Substituir por slim selects explícitos, especialmente em tabelas com colunas JSON pesadas.

### 1.3 Console.log Spam em Produção — 160 ocorrências em 17 arquivos

**Impacto**: Poluição de logs do console, exposição de informações internas.

| Componente | Ocorrências | Tipo |
|------------|-------------|------|
| `PWAInstallPrompt.tsx` | 15 | `console.log` |
| `Members.tsx` | 4 | `console.log` (dados de subscription) |
| `ThemeToggle.tsx` | 1 | `console.debug` |

**Status**: ✅ Removidos 15 `console.log` do `PWAInstallPrompt.tsx` nesta sessão.

### 1.4 Edge Functions Redundantes — ~25 funções sobrepostas

| Grupo | Funções | Redundância |
|-------|---------|-------------|
| **Notificação** (11) | `send-alert-email`, `send-brute-force-alert`, `send-health-alert`, `send-notification`, `send-report-notification`, `send-security-alert`, `send-security-notification`, `send-system-alert`, `dispatch-notification`, `notification-dispatcher`, `security-alert-dispatcher` | Poderiam ser 2-3 |
| **Cleanup** (8) | `cleanup-jobs`, `cleanup-stuck-jobs`, `cleanup-stale-*`, `auto-cleanup-jobs`, `cleanup-offline-agents-jobs`, `cleanup-orphaned-data`, `cleanup-telemetry`, `security-cleanup-cron` | Sobrepostas |
| **Sync** (7) | `sync-agent-script`, `sync-agent-release-content`, `sync-release-content`, `sync-release-from-codebase`, `sync-release-from-repo`, `sync-scripts-direct`, `sync-storage-bucket` | Múltiplos caminhos |

**Impacto**: ~270 Edge Functions = overhead de deploy, superfície de ataque expandida, custo de cloud.

### 1.5 Hard-coded Colors em Componentes

**Impacto**: Viola design system, cores não acompanham temas dark/light.

| Componente | Exemplo |
|------------|---------|
| `useHealthStatusColor` | `text-green-500`, `text-red-500` |
| `useSeverityColor` | `text-red-500 bg-red-500/10` |
| `PWAInstallPrompt` | `bg-green-500/10`, `bg-blue-500/10`, `bg-purple-500/10` |
| `useIncidentGroups` | `text-red-600 dark:text-red-400` |

---

## 2. Sugestões de Melhorias

### 2.1 Slim Selects para Hooks de Alta Frequência
- Identificar os 10 hooks mais chamados e substituir `select('*')` por campos explícitos
- Prioridade: hooks no dashboard principal e monitoramento de agentes
- **Benefício**: Redução de ~40-60% no payload de rede

### 2.2 Consolidação de Edge Functions
- **Notificações**: Migrar as 11 funções para `notification-dispatcher` como proxy
- **Cleanup**: Unificar em `system-maintenance` com action routing
- **Sync**: Consolidar em `release-sync`
- **Benefício**: Redução de ~25 funções, menos superfície de ataque

### 2.3 Tipo Seguro para Views
- Criar tipos manuais para as 2 views restantes com `as any` (`v_incident_groups`, `insight_feedback_quality`)
- Adicionar types locais nos hooks que as consomem
- **Benefício**: Eliminar risco de quebra silenciosa

### 2.4 Design Tokens para Cores de Severidade
- Criar tokens CSS como `--severity-critical`, `--severity-high`, `--severity-medium`, `--severity-low`
- Substituir hard-coded colors por classes semânticas
- **Benefício**: Tema consistente, manutenção simplificada

---

## 3. Soluções Técnicas

| Problema | Solução | Complexidade |
|----------|---------|-------------|
| `select('*')` | Script de auditoria + refactor incremental por hook | Média |
| Edge Functions duplicadas | Proxy pattern → dispatcher centralizado | Alta |
| `as any` em views | Tipos manuais em `src/types/views.ts` | Baixa |
| Console spam | Substituir por `logger` utility existente | Baixa |
| Hard-coded colors | CSS custom properties + Tailwind plugin | Média |

---

## 4. Remoção de Código Não Utilizado

### 4.1 Já Removido (esta sessão + anterior)
- ✅ 8 Edge Functions perigosas/obsoletas (chaos-test, nuke-reinstall-mit, patches, etc.)
- ✅ 6 `as any` desnecessários em views tipadas
- ✅ 15 `console.log` em PWAInstallPrompt

### 4.2 Candidatos para Remoção

| Código | Verificação Necessária | Risco |
|--------|----------------------|-------|
| `ack-job` endpoint | Monitorar % de agentes v1 via `/admin/jobs-v3-migration` | Baixo (sunset 2026-06-01) |
| `jobs_normalized` view | Remover após sunset do ack-job | Baixo |
| 6 funções `send-*-alert` legadas | Verificar callers via `tools/audit-edge-functions.sh` | Médio |
| Páginas `TestComplianceGenerator.tsx`, `AgentTest.tsx` | Verificar se usadas em staging | Baixo |
| `Privacy.tsx` + `Privacidade.tsx` (duplicadas?) | Verificar rotas | Baixo |

### 4.3 Processo de Verificação para Remoção Segura

1. **Buscar referências**: `rg "função-nome" src/ supabase/` para confirmar zero uso
2. **Verificar cron jobs**: Checar `supabase/config.toml` para schedules
3. **Verificar callers de Edge Functions**: Buscar invocações em hooks, pages e outras EFs
4. **Testar em staging**: Deploy sem a função e monitorar erros por 48h
5. **Documentar remoção**: Atualizar `docs/LEGACY_CLEANUP_PLAN.md`

---

## Métricas de Progresso

| Métrica | Antes | Agora | Meta |
|---------|-------|-------|------|
| `as any` casts | 1.156 | ~1.121 | <100 |
| `select('*')` em hooks | 330 | 330 | <50 |
| Edge Functions | ~270 | ~262 | <200 |
| Console spam (produção) | 160 | ~145 | 0 |
| Vulnerabilidades corrigidas | 0 | 7 (SA-001 a SA-007) | — |
