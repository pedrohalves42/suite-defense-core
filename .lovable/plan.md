
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

## Resultado
- 11 funções inlined em playbook-core.ts, playbook-automation.ts, playbook-analysis.ts
- 6 mantidas standalone (complexidade/auth): execute-playbook-action, auto-remediate, evaluate-automation-rules, evaluate-playbook-triggers, autonomous-safe-mode, evaluate-software-risk

---

# Fase 1D: Inline Report Namespace (7 → handlers) ✅ CONCLUÍDO

## Funções Migradas (7)

| Função | Gateway | Handler |
|--------|---------|---------|
| `generate-compliance-report` | ops-gateway | `handlers/report-generators.ts` |
| `generate-security-report` | ops-gateway | `handlers/report-generators.ts` |
| `generate-explainable-report` | ops-gateway | `handlers/report-generators.ts` |
| `generate-executive-report` | ops-gateway | `handlers/report-scheduled.ts` |
| `generate-weekly-report` | ops-gateway | `handlers/report-scheduled.ts` |
| `auto-generate-report` | ops-gateway | `handlers/report-scheduled.ts` |
| `scheduled-report-generator` | ops-gateway | `handlers/report-scheduled.ts` |

## Funções Mantidas Standalone (1)

| Função | Razão |
|--------|-------|
| `list-reports` | serveAgent com HMAC — auth incompatível com gateway |

## Ganhos Fase 1D
- **-7 cold starts** por chamada report
- **-7 funções standalone** deletadas
- **Frontend atualizado**: Automations.tsx migrado para ops-gateway
