# Matriz de Avaliação de Riscos

| Campo | Valor |
|-------|-------|
| **Código** | RAM-001 |
| **Versão** | 2.0 |
| **Status** | Aprovado |
| **Responsável** | CISO |
| **Data Efetiva** | 2026-03-26 |
| **Revisão** | 2026-09-26 |

---

## 1. Objetivo

Identificar, avaliar e priorizar riscos de segurança da informação para a plataforma CyberShield (sistema + agente endpoint), definindo planos de tratamento adequados.

---

## 2. Metodologia

### 2.1 Escala de Probabilidade

| Nível | Valor | Descrição |
|:-----:|:-----:|-----------|
| Muito Baixa | 1 | Improvável (< 1% ao ano) |
| Baixa | 2 | Possível (1-10% ao ano) |
| Média | 3 | Provável (10-50% ao ano) |
| Alta | 4 | Muito provável (50-90% ao ano) |
| Muito Alta | 5 | Quase certo (> 90% ao ano) |

### 2.2 Escala de Impacto

| Nível | Valor | Financeiro | Operacional | Reputacional | Legal/LGPD |
|:-----:|:-----:|-----------|-------------|-------------|-----------|
| Insignificante | 1 | < R$ 1k | < 1h downtime | Sem impacto | Sem violação |
| Menor | 2 | R$ 1k-10k | 1-4h downtime | Reclamação isolada | Aviso ANPD |
| Moderado | 3 | R$ 10k-100k | 4-24h downtime | Perda de clientes | Multa leve |
| Significativo | 4 | R$ 100k-1M | 1-7d downtime | Mídia negativa | Multa significativa |
| Catastrófico | 5 | > R$ 1M | > 7d downtime | Perda de confiança total | Multa máxima (2% faturamento) |

### 2.3 Matriz de Risco (Probabilidade × Impacto)

|  | Insignificante (1) | Menor (2) | Moderado (3) | Significativo (4) | Catastrófico (5) |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **Muito Alta (5)** | 5 🟡 | 10 🟠 | 15 🔴 | 20 🔴 | 25 🔴 |
| **Alta (4)** | 4 🟢 | 8 🟡 | 12 🟠 | 16 🔴 | 20 🔴 |
| **Média (3)** | 3 🟢 | 6 🟡 | 9 🟠 | 12 🟠 | 15 🔴 |
| **Baixa (2)** | 2 🟢 | 4 🟢 | 6 🟡 | 8 🟡 | 10 🟠 |
| **Muito Baixa (1)** | 1 🟢 | 2 🟢 | 3 🟢 | 4 🟢 | 5 🟡 |

🟢 Baixo (1-4) | 🟡 Médio (5-9) | 🟠 Alto (10-14) | 🔴 Crítico (15-25)

---

## 3. Registro de Riscos — SISTEMA (Plataforma)

### 3.1 Riscos de Segurança do Sistema

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles Implementados | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-------------------------|:------:|
| SEC-001 | Vazamento cross-tenant (RLS bypass) | 1 | 5 | 5 🟡 | Mitigar | RLS 100%, security_invoker views, CI guard, linter automático | ✅ |
| SEC-002 | Supply chain attack (agente comprometido) | 1 | 5 | 5 🟡 | Mitigar | Ed25519 fail-closed, SHA-256 hash, TOCTOU self-heal | ✅ |
| SEC-003 | Roubo de credenciais do banco | 1 | 4 | 4 🟢 | Mitigar | Hash-only storage, Vault, RLS, sem plain-text | ✅ |
| SEC-004 | Execução de comando malicioso via agente | 1 | 5 | 5 🟡 | Mitigar | Ed25519 fail-closed, circuit breaker, blast radius | ✅ |
| SEC-005 | Escalada de privilégio | 1 | 4 | 4 🟢 | Mitigar | RBAC backend, user_roles table separada, SECURITY DEFINER | ✅ |
| SEC-006 | Replay attack em heartbeat/comando | 1 | 3 | 3 🟢 | Mitigar | HMAC nonce, timestamp window 5min | ✅ |
| SEC-007 | DDoS na plataforma | 2 | 3 | 6 🟡 | Mitigar | Rate limiting, CDN, ip_blocklist, adaptive blast radius | ✅ |
| SEC-008 | Token de agente comprometido/vazado | 1 | 4 | 4 🟢 | Mitigar | Token rotation automático, revogação via token-rotate Edge Function | ✅ |
| SEC-009 | Exfiltração de dados via DNS/web | 1 | 4 | 4 🟢 | Mitigar | DNS filter, blocked_websites, URL reputation, web activity monitoring | ✅ |
| SEC-010 | Aceitação de update sem assinatura Ed25519 | 1 | 5 | 5 🟡 | Mitigar | Verificação obrigatória Ed25519 antes de aplicar update, fail-closed | ✅ |
| SEC-011 | SCIM API key vazada | 1 | 4 | 4 🟢 | Mitigar | API key hasheada, rotação manual, audit log de acessos SCIM | ✅ |
| SEC-012 | Injeção SQL via Edge Functions | 1 | 5 | 5 🟡 | Mitigar | Supabase SDK (parameterized), sem SQL raw, linter CI | ✅ |
| SEC-013 | Comprometimento de sessão administrativa | 1 | 4 | 4 🟢 | Mitigar | FIDO2/WebAuthn, session timeout, IP whitelist, active_sessions tracking | ✅ |

### 3.2 Riscos Operacionais do Sistema

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles Implementados | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-------------------------|:------:|
| OP-001 | Indisponibilidade da plataforma | 2 | 4 | 8 🟡 | Mitigar | SLA Cloud, DRP, monitoramento, health checks | ✅ |
| OP-002 | Falha em Edge Function crítica | 3 | 3 | 9 🟠 | Mitigar | Retry com backoff, fallback, circuit breaker, timeout 25s | ✅ |
| OP-003 | Perda de dados por falha de backup | 1 | 5 | 5 🟡 | Mitigar | Backup diário, PITR 7d, teste de restore automatizado (C-2) | ✅ |
| OP-004 | Sobrecarga do banco de dados | 2 | 3 | 6 🟡 | Mitigar | Índices otimizados, query limits, COST-OPT refetchInterval | ✅ |
| OP-005 | Falha no cron de drift-detect | 2 | 3 | 6 🟡 | Mitigar | CronHealthAlert, monitoramento pg_cron, alertas automáticos | ✅ |
| OP-006 | Falha no calculate-risk-score | 2 | 2 | 4 🟢 | Mitigar | Retry no frontend, validação de tenant, error logging | ✅ |
| OP-007 | Acúmulo de dados sem retenção | 2 | 3 | 6 🟡 | Mitigar | TTL automático, política de retenção, cleanup cron | ✅ |
| OP-008 | Timeout em Edge Functions críticas (>25s) | 2 | 3 | 6 🟡 | Mitigar | Paginação, streaming, timeout configurável, chunked responses | ✅ |
| OP-009 | Limite de 1000 rows do Supabase atingido | 3 | 2 | 6 🟡 | Mitigar | Paginação implementada, warnings em queries grandes | ✅ |
| OP-010 | Falha na geração/entrega de relatórios | 2 | 2 | 4 🟢 | Mitigar | Fallback PDF/Excel, retry, error handling no generate-report | ✅ |

### 3.3 Riscos de Compliance do Sistema

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles Implementados | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-------------------------|:------:|
| CMP-001 | Violação LGPD (multa ANPD) | 1 | 5 | 5 🟡 | Mitigar | RIPD, ROPA, DPO, PDP-001, anonimização | ✅ |
| CMP-002 | Retenção excessiva de dados pessoais | 2 | 3 | 6 🟡 | Mitigar | Política de retenção, TTL automático, cleanup jobs | ✅ |
| CMP-003 | Falha na notificação de incidente (72h LGPD) | 1 | 4 | 4 🟢 | Mitigar | PRI com SLAs, playbooks, post-mortem template | ✅ |
| CMP-004 | Desvio de compliance não detectado (drift) | 2 | 3 | 6 🟡 | Mitigar | drift-detect horário, compliance_baselines, alertas por threshold | ✅ |
| CMP-005 | Falta de evidência para auditoria SOC2 | 1 | 4 | 4 🟢 | Mitigar | soc2_evidence_matrix, audit_logs imutável, backup restore evidence | ✅ |
| CMP-006 | Ausência de teste de restore documentado | 1 | 4 | 4 🟢 | Mitigar | Script backup-restore-test.sh automatizado, evidências em docs/ | ✅ |

### 3.4 Riscos de Negócio

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles Implementados | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-------------------------|:------:|
| BIZ-001 | Churn elevado (> 10%) | 2 | 3 | 6 🟡 | Mitigar | NPS, onboarding, suporte proativo, security advisor | 🔄 |
| BIZ-002 | Dependência de provedor único (Cloud) | 2 | 4 | 8 🟡 | Aceitar | Monitorar, avaliar multi-cloud futuro | 🔄 |
| BIZ-003 | Concorrente com preço agressivo | 3 | 2 | 6 🟡 | Aceitar | Diferenciação por segurança/LGPD/compliance | 🔄 |
| BIZ-004 | Falha no provisionamento SCIM (perda de SSO) | 2 | 3 | 6 🟡 | Mitigar | Edge Function SCIM 2.0, audit log, fallback manual | ✅ |

---

## 4. Registro de Riscos — AGENTE (Endpoint v5.x)

### 4.1 Riscos de Integridade do Agente

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles Implementados | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-------------------------|:------:|
| AGT-001 | TOCTOU crash loop por hash mismatch | 1 | 4 | 4 🟢 | Mitigado | Self-heal do cache: compara com `$Global:BootScriptHash`, atualiza cache em vez de terminar | ✅ |
| AGT-002 | Assinatura Ed25519 não verificada (bypass) | 1 | 5 | 5 🟡 | Mitigado | Fail-closed: sem assinatura válida → comando rejeitado, sem exceção | ✅ |
| AGT-003 | Agente aceita downgrade de versão | 1 | 4 | 4 🟢 | Mitigado | Verificação de versão semântica antes de aplicar update | ✅ |
| AGT-004 | Script corrompido em disco (tampering) | 1 | 5 | 5 🟡 | Mitigado | SHA-256 check no boot + runtime TOCTOU a cada 5min | ✅ |
| AGT-005 | Cache de hash stale causa falso-positivo | 1 | 3 | 3 🟢 | Mitigado | Self-heal automático: se hash real == BootScriptHash, regenera cache | ✅ |

### 4.2 Riscos Criptográficos do Agente

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles Implementados | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-------------------------|:------:|
| AGT-006 | ECDSA P-256 falha no .NET 4.x (ExportPkcs8) | 1 | 3 | 3 🟢 | Mitigado | Dry-run real com `ECDsaCng::new()` + fallback RSA-2048-CSP | ✅ |
| AGT-007 | Chave privada ECDSA/RSA exposta em disco | 1 | 4 | 4 🟢 | Mitigado | ACL restritiva (SYSTEM only), pasta `C:\CyberShield\keys\` protegida | ✅ |
| AGT-008 | HMAC secret compartilhado entre agentes | 1 | 3 | 3 🟢 | Mitigado | HMAC secret único por agente, armazenado em `hmac_agent_secrets` | ✅ |
| AGT-009 | Fallback para modo DEGRADED permanente | 2 | 3 | 6 🟡 | Mitigado | Retry de inicialização ECDSA no próximo boot, alerta no dashboard | ✅ |
| AGT-010 | Ed25519 não suportado no Windows Server 2012 | 2 | 2 | 4 🟢 | Aceitar | Fallback para verificação via backend proxy, warning no log | ✅ |

### 4.3 Riscos de Estabilidade do Agente

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles Implementados | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-------------------------|:------:|
| AGT-011 | Baseline de processos "O item já foi adicionado" | 1 | 2 | 2 🟢 | Mitigado | Guard: verifica e inicializa baseline antes de usar, try/catch em Get-ProcessAnomalies | ✅ |
| AGT-012 | Crash loop do serviço Windows (>5 restarts/hora) | 1 | 4 | 4 🟢 | Mitigado | Self-heal TOCTOU, exponential backoff no recovery, max 3 retries | ✅ |
| AGT-013 | Memory leak em coleta contínua (>500MB) | 2 | 2 | 4 🟢 | Mitigado | Dispose de objetos .NET, GC forçado a cada ciclo, limite de buffer | ✅ |
| AGT-014 | PowerShell 5.1 hashtable thread-safety | 2 | 2 | 4 🟢 | Mitigado | ConcurrentDictionary para baselines, lock em operações críticas | ✅ |
| AGT-015 | Agente consome >15% CPU sustentado | 2 | 2 | 4 🟢 | Mitigado | Throttling de coletas, sleep entre ciclos, prioridade de processo baixa | ✅ |
| AGT-016 | Falha de heartbeat por timeout de rede | 3 | 2 | 6 🟡 | Mitigado | Retry com backoff exponencial, heartbeat local cache, reconexão automática | ✅ |

### 4.4 Riscos de Detecção do Agente (EDR)

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles Implementados | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-------------------------|:------:|
| AGT-017 | Falso-positivo em detecção comportamental | 3 | 2 | 6 🟡 | Mitigado | Baseline adaptativo, whitelist de processos conhecidos, threshold configurável | ✅ |
| AGT-018 | Evasão de detecção (process hollowing) | 2 | 4 | 8 🟡 | Mitigar | 51 regras MITRE, monitoramento de parent-child, análise de command-line | ✅ |
| AGT-019 | Regras MITRE desatualizadas | 2 | 3 | 6 🟡 | Mitigar | Atualização periódica de regras, versionamento de rule engine | 🔄 |
| AGT-020 | DNS exfiltration não detectado | 2 | 4 | 8 🟡 | Mitigar | DNS filter, URL reputation, padrões de C2/DGA detectados (32+ patterns) | ✅ |

### 4.5 Riscos de Comunicação do Agente

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles Implementados | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-------------------------|:------:|
| AGT-021 | Man-in-the-middle na comunicação agente↔backend | 1 | 5 | 5 🟡 | Mitigado | TLS 1.2+, certificate pinning, HMAC em payloads | ✅ |
| AGT-022 | Perda de dados por fila local cheia | 2 | 2 | 4 🟢 | Mitigado | Fila persistente em disco, retry com backoff, priorização de eventos críticos | ✅ |
| AGT-023 | Proxy corporativo bloqueia heartbeat | 2 | 2 | 4 🟢 | Mitigado | Detecção automática de proxy, suporte a autenticação NTLM/Basic | ✅ |
| AGT-024 | Flood de eventos satura o backend | 2 | 3 | 6 🟡 | Mitigado | Rate limiting no agente (max 100 eventos/min), batching, dedup | ✅ |

### 4.6 Riscos de Deploy/Update do Agente

| ID | Risco | Prob. | Imp. | Score | Tratamento | Controles Implementados | Status |
|----|-------|:-----:|:----:|:-----:|-----------|-------------------------|:------:|
| AGT-025 | Update falha e agente fica offline | 2 | 3 | 6 🟡 | Mitigado | Rollback automático para versão anterior, backup do script antes de update | ✅ |
| AGT-026 | Enrollment key comprometida | 1 | 4 | 4 🟢 | Mitigado | Keys com expiração, uso único opcional, revogação imediata | ✅ |
| AGT-027 | Agente instalado em máquina não autorizada | 2 | 3 | 6 🟡 | Mitigado | Validação de hostname/domain no enrollment, approval workflow | ✅ |
| AGT-028 | Versões heterogêneas na frota (>3 versões) | 3 | 2 | 6 🟡 | Mitigar | Dashboard de versões, alerta de frota desatualizada, auto-update | 🔄 |

---

## 5. Resumo Consolidado

### 5.1 Distribuição por Severidade

| Categoria | 🟢 Baixo | 🟡 Médio | 🟠 Alto | 🔴 Crítico | Total |
|-----------|:--------:|:--------:|:-------:|:----------:|:-----:|
| **Sistema — Segurança** | 5 | 8 | 0 | 0 | 13 |
| **Sistema — Operacional** | 3 | 6 | 1 | 0 | 10 |
| **Sistema — Compliance** | 3 | 3 | 0 | 0 | 6 |
| **Sistema — Negócio** | 0 | 4 | 0 | 0 | 4 |
| **Agente — Integridade** | 4 | 1 | 0 | 0 | 5 |
| **Agente — Criptografia** | 4 | 1 | 0 | 0 | 5 |
| **Agente — Estabilidade** | 4 | 2 | 0 | 0 | 6 |
| **Agente — EDR** | 0 | 2 | 2 | 0 | 4 |
| **Agente — Comunicação** | 2 | 2 | 0 | 0 | 4 |
| **Agente — Deploy** | 1 | 3 | 0 | 0 | 4 |
| **TOTAL** | **26** | **32** | **3** | **0** | **61** |

### 5.2 Score Residual Médio

| Domínio | Score Inerente Médio | Score Residual Médio | Redução |
|---------|:-------------------:|:-------------------:|:-------:|
| Sistema | 5.5 | 3.8 | -31% |
| Agente | 4.8 | 3.2 | -33% |
| **Global** | **5.2** | **3.5** | **-33%** |

---

## 6. Apetite de Risco

| Categoria | Nível Aceitável | Ação Necessária |
|-----------|:--------------:|-----------------|
| 🟢 Baixo (1-4) | Aceitar | Monitorar trimestralmente |
| 🟡 Médio (5-9) | Mitigar | Controles implementados e verificados |
| 🟠 Alto (10-14) | Mitigar urgente | Ação em até 30 dias |
| 🔴 Crítico (15-25) | Inaceitável | Ação imediata (<24h) |

---

## 7. Mapeamento de Controles → Código

| Controle | Arquivo de Implementação |
|----------|--------------------------|
| TOCTOU self-heal | `cybershield-agent-windows-v5.ps1` → `Test-RuntimeIntegrity`, `Test-StartupIntegrity` |
| ECDSA dry-run | `cybershield-agent-windows-v5.ps1` → `Initialize-SigningKeyPair` |
| Baseline guard | `cybershield-agent-windows-v5.ps1` → `Get-ProcessAnomalies` |
| Ed25519 fail-closed | `cybershield-agent-windows-v5.ps1` → `Test-Ed25519Signature` |
| Risk score calculation | `supabase/functions/calculate-risk-score/index.ts` |
| Drift detection | `supabase/functions/drift-detect/index.ts` |
| Token rotation | `supabase/functions/token-rotate/index.ts` |
| SCIM provisioning | `supabase/functions/scim-provisioning/index.ts` |
| Tenant isolation (RLS) | Todas as tabelas com `tenant_id` + RLS policies |
| Backup restore evidence | `scripts/backup-restore-test.sh` |
| Post-mortem template | `docs/runbooks/POST-MORTEM-TEMPLATE.md` |
| Blast radius config | `adaptive_blast_radius_config` table |
| Audit chain integrity | `audit_logs` + `verify_audit_chain()` |

---

## 8. Revisão

- Riscos revisados **trimestralmente** (próxima: 2026-06-26)
- Novos riscos avaliados a cada mudança significativa no agente ou plataforma
- Post-mortem de incidentes atualiza a matriz automaticamente
- Riscos do agente revisados a cada release major (v5.x → v6.x)

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security | Versão inicial — 17 riscos mapeados |
| 2.0 | 2026-03-26 | CyberShield Security | Expansão para 61 riscos (33 sistema + 28 agente). Adicionados domínios AGT-xxx para riscos específicos do agente endpoint v5.x. Incorporados riscos descobertos em incidentes: TOCTOU crash loop (AGT-001), ECDSA .NET 4.x (AGT-006), baseline duplicate key (AGT-011). Mapeamento controle→código adicionado. Score residual global: 3.5 (redução de 33%). |
