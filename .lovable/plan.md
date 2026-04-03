
# Fase 6: Consolidação de Proxy Maps + Migração Frontend — ✅ CONCLUÍDA

## Resultado: 80 standalone (sem deleções nesta fase, foco em padronização)

### 6A: Novos proxies no api-gateway (12 funções adicionadas):

| Função | Action | Tipo |
|--------|--------|------|
| `action-center-feed` | `agent:action-center-feed` | serveTenant |
| `ai-action-executor` | `agent:ai-action-executor` | serveTenant |
| `ai-agent-assist` | `agent:ai-agent-assist` | serveTenant |
| `ai-analyze-agent` | `agent:ai-analyze-agent` | serveTenant |
| `ai-full-audit` | `agent:ai-full-audit` | serveTenant |
| `ai-quality-check` | `agent:ai-quality-check` | serveTenant |
| `ai-red-team-assessment` | `agent:ai-red-team-assessment` | serveTenant |
| `ai-router` | `agent:ai-router` | serveTenant |
| `ai-system-audit` | `agent:ai-system-audit` | serveTenant |
| `calculate-compliance` | `security:calculate-compliance` | serveTenant |
| `export-evidence-bundle` | `security:export-evidence-bundle` | serveTenant |
| `fido2-register` | `security:fido2-register` | serveTenant |
| `translate-cve` | `security:translate-cve` | serveTenant |

### 6B: Novos proxies no ops-gateway (3 funções adicionadas):

| Função | Action | Tipo |
|--------|--------|------|
| `ai-insight-dispatcher` | `sync:ai-insight-dispatcher` | serveInternal |
| `ai-predict-agent-failure` | `check:ai-predict-agent-failure` | serveInternal |
| `ai-system-analyzer` | `check:ai-system-analyzer` | serveInternal |

### 6E: Frontend migrado para callGateway():

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `useActionCenter.ts` | `invoke('action-center-feed')` | `callGateway('agent', 'action-center-feed')` |
| `RejectInsightDialog.tsx` | `invoke('action-center-feed')` | `callGateway('agent', 'action-center-feed')` |
| `AgentVersionSync.tsx` | `invoke('force-reinstall-fleet')` | `callGateway('agent', 'force-reinstall-fleet')` |
| `CVEDatabaseStatus.tsx` | `invoke('translate-cve')` | `callGateway('security', 'translate-cve')` |
| `RegisterLatestRelease.tsx` | `invoke('register-agent-release')` | `callGateway('build', 'register-agent-release')` |
| `ScriptUploader.tsx` | `invoke('upload-release-content')` | `callGateway('build', 'upload-release-content')` |
| `useAgentSnapshot.ts` | `invoke('agent-snapshot')` | `callGateway('agent', 'agent-snapshot')` |
| `useAiActionApproval.ts` | `invoke('ai-router')` | `callGateway('agent', 'ai-router')` |
| `useAutoRemediation.ts` | `invoke('auto-remediate')` x2 | `callGateway('playbook', 'auto-remediate')` |

### Validação:
- ✅ Zero erros TypeScript (`npx tsc --noEmit --skipLibCheck`)
- ✅ Deploy api-gateway + ops-gateway com sucesso
- ✅ Auth 401 confirmado (proxy funcional, requer login)

### Gateways ativos: 3
- `api-gateway` (admin, billing, security, build, agent — 46 inlined + 31 proxy)
- `ops-gateway` (check, sync, playbook, report, cleanup, notify, security — 82 inlined + 10 proxy)
- `public-gateway` (public — sem auth)

### Próximas fases (6C/6D/6F):
- 6C: Inline 6 single-file proxies do api-gateway (eliminar standalone)
- 6D: Inline 3 proxies do ops-gateway
- 6F: Inline 4 AI functions pequenas
- Meta: < 65 standalone
