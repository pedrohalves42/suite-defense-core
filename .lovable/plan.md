
# Fase 1A: Inline Security Namespace (28 proxied → handlers) ✅ CONCLUÍDO

## Resultado
- 28 funções de segurança inlined nos gateways (api-gateway + ops-gateway)
- Handlers criados: security-threats.ts, security-scanning.ts, security-intel.ts (api-gateway) + security-ops.ts (ops-gateway)
- 6 funções mantidas standalone (auth específica): scan-virus, submit-vuln-findings, update-baseline, check-failed-logins, record-failed-login, translate-cve

---

# Fase 1B: Inline Honeypot + Anomaly + Block-Website (5 → handlers) ✅ CONCLUÍDO

## Resultado
- 5 funções inlined: activate-agent-honeypot, revert-agent-honeypot, create-honeypot-pool, ai-behavioral-anomaly-detector, block-website
- 3 mantidas standalone: honeypot-handler, get-blocked-websites, serve-dns-filter

---

# Fase 1C: Inline Playbook Namespace (11 → handlers) ✅ CONCLUÍDO

## Funções Migradas (11)

| Função | Gateway | Handler |
|--------|---------|---------|
| `execute-playbook` | ops-gateway | `handlers/playbook-core.ts` |
| `process-playbook-trigger-logs` | ops-gateway | `handlers/playbook-core.ts` |
| `rollback-by-decision-event` | ops-gateway | `handlers/playbook-core.ts` |
| `rollback-remediation` | ops-gateway | `handlers/playbook-core.ts` |
| `resolve-action-policy` | ops-gateway | `handlers/playbook-core.ts` |
| `soar-engine` | ops-gateway | `handlers/playbook-automation.ts` |
| `auto-execute-ai-actions` | ops-gateway | `handlers/playbook-automation.ts` |
| `oncall-integration` | ops-gateway | `handlers/playbook-automation.ts` |
| `create-itsm-ticket` | ops-gateway | `handlers/playbook-automation.ts` |
| `calculate-risk-score` | ops-gateway | `handlers/playbook-analysis.ts` |
| `run-attack-simulation` | ops-gateway | `handlers/playbook-analysis.ts` |

## Funções Mantidas Standalone (6)

| Função | Razão |
|--------|-------|
| `execute-playbook-action` | Orchestrator complexo (318+ linhas, sub-módulos) |
| `auto-remediate` | Blast radius checks críticos (311 linhas) |
| `evaluate-automation-rules` | 5 sub-módulos (700+ linhas total) |
| `evaluate-playbook-triggers` | 3 sub-módulos (condition-engine, approval-handler) |
| `autonomous-safe-mode` | 3 rules/ processors (1282 linhas total) |
| `evaluate-software-risk` | servePublic — auth incompatível com gateway |

## Ganhos Fase 1C
- **-11 cold starts** por chamada playbook
- **-11 funções standalone** deletadas
- **Frontend atualizado**: 5 hooks/componentes migrados para callGateway
