# 📚 Documentação CyberShield

Índice organizado de toda a documentação do projeto.

---

## 📁 Estrutura de Diretórios

| Pasta | Conteúdo | Qtd |
|-------|----------|:---:|
| [`policies/`](./policies/) | Políticas de segurança e governança (ISP, ACP, CMP, etc.) | 15 |
| [`compliance/`](./compliance/) | Conformidade SOC 2, LGPD, DPIA, SLA, matriz de riscos | 12 |
| [`legal/`](./legal/) | Termos de serviço, DPA | 2 |
| [`procedures/`](./procedures/) | Procedimentos operacionais (break glass, DR, MFA, incidentes) | 4 |
| [`runbooks/`](./runbooks/) | Runbooks técnicos para resposta a incidentes | 6 |
| [`security/`](./security/) | Arquitetura de segurança, RLS, auditorias, invariantes | 12 |
| [`architecture/`](./architecture/) | ADRs, arquitetura do sistema, fluxo de dados, HMAC | 19 |
| [`agente/`](./agente/) | Guias de deploy, instalação, troubleshooting do agente | 20 |
| [`jobs/`](./jobs/) | Engine de jobs, migração v3, governança | 6 |
| [`api/`](./api/) | Documentação de API | 2 |
| [`operacoes/`](./operacoes/) | Guias operacionais, troubleshooting, performance | 15 |
| [`governanca/`](./governanca/) | Whitepaper, framework de auditoria, governança IA | 5 |
| [`testes/`](./testes/) | Validações, testes E2E, resultados de fases | 6 |
| [`adr/`](./adr/) | Índice de Architecture Decision Records | 5 |
| [`keys/`](./keys/) | Chaves públicas (ECDSA) | 2 |

---

## 🔑 Documentos Essenciais

### Para Auditores / Compliance
- [Política de Segurança da Informação](./policies/01_information_security_policy.md)
- [Controle de Acesso](./policies/02_access_control_policy.md)
- [Matriz SOC 2](./compliance/soc2_evidence_matrix.md)
- [DPIA / RIPD](./compliance/DPIA_RIPD.md)
- [ROPA](./compliance/ROPA.md)

### Para Operadores MSP
- [Guia de Deploy do Agente](./agente/AGENT_DEPLOYMENT_GUIDE.md)
- [Troubleshooting do Agente](./agente/AGENT_TROUBLESHOOTING_NINJA.md)
- [Guia do Dashboard](./operacoes/DASHBOARD_USER_GUIDE_UPDATED.md)

### Para Engenharia
- [Visão Geral da Arquitetura](./architecture/ARCHITECTURE_OVERVIEW.md)
- [Arquitetura de Segurança](./security/SECURITY_ARCHITECTURE.md)
- [Especificação HMAC](./architecture/HMAC_SPECIFICATION.md)
- [Invariantes de Segurança](./security/SECURITY_INVARIANTS.md)

### Para Emergências
- [Runbook: Modo de Emergência](./runbooks/RUNBOOK-EMERGENCY-MODE.md)
- [Runbook: Erros 500](./runbooks/RUNBOOK-EDGE-500.md)
- [Procedimento Break Glass](./procedures/break_glass_procedure.md)
- [Plano de Resposta a Incidentes](./procedures/incident_response_plan.md)

---

*Última atualização: 2026-03-05*
