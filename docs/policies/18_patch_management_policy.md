# Política de Gestão de Patches

| Campo | Valor |
|-------|-------|
| **Código** | PMP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2026-03-05 |
| **Revisão** | 2027-03-05 |
| **Critério SOC 2** | CC6.7, CC7.1 |

---

## 1. Objetivo

Estabelecer um ciclo formal de identificação, avaliação, teste e aplicação de patches de segurança em todos os componentes de infraestrutura, sistemas operacionais e dependências do CyberShield.

---

## 2. Escopo

| Componente | Responsável | Método de Patching |
|-----------|------------|-------------------|
| Dependências de aplicação (npm) | Engenharia | Dependabot + revisão manual |
| Runtime (Node.js, Deno) | DevOps | Atualização de imagem |
| Banco de dados (PostgreSQL) | Provedor cloud | Gerenciado |
| Sistema operacional (agentes) | Operações MSP | Jobs de patching via CyberShield |
| TLS / Certificados | Infraestrutura | Renovação automática |
| Bibliotecas criptográficas | Engenharia | Atualização prioritária |

---

## 3. Classificação de Patches

### 3.1 Níveis de Prioridade

| Prioridade | CVSS Score | SLA de Aplicação | Exemplos |
|:----------:|:---------:|:-----------------:|---------|
| **Emergencial** | 9.0 – 10.0 | 24 horas | RCE, zero-day explorado ativamente |
| **Crítico** | 7.0 – 8.9 | 72 horas | Privilege escalation, SQL injection |
| **Alto** | 4.0 – 6.9 | 14 dias | XSS, CSRF, information disclosure |
| **Médio** | 0.1 – 3.9 | 30 dias | DoS parcial, bugs de configuração |
| **Baixo** | Funcional | Próximo ciclo | Melhorias de performance, UX |

### 3.2 Fatores de Ajuste

A prioridade pode ser elevada se:
- A vulnerabilidade está sendo explorada ativamente (in the wild)
- O componente afetado processa dados pessoais
- O componente é exposto à internet
- Existem provas de conceito (PoC) públicas

---

## 4. Processo de Patching

### 4.1 Fluxo

```
1. Identificação
   - Scan automatizado (npm audit, Dependabot, CVE feeds)
   - Notificações de fornecedores
   - Alertas de segurança (CERT.br, NVD)
   ↓
2. Avaliação
   - Classificação de prioridade (CVSS + contexto)
   - Análise de impacto no sistema
   - Identificação de dependências afetadas
   ↓
3. Teste
   - Aplicação em ambiente de staging
   - Execução de testes automatizados
   - Validação de regressão
   ↓
4. Aprovação
   - Emergencial: Security Officer (pode ser retroativa)
   - Crítico/Alto: CAB (Change Advisory Board) express
   - Médio/Baixo: CAB regular
   ↓
5. Aplicação
   - Deploy via pipeline CI/CD
   - Rollback plan documentado
   - Monitoramento pós-deploy
   ↓
6. Verificação
   - Confirmação de aplicação bem-sucedida
   - Re-scan para confirmar remediação
   - Atualização do inventário de ativos
```

### 4.2 Exceções para Emergências

Para vulnerabilidades emergenciais (CVSS ≥ 9.0):
- Aprovação pode ser do Security Officer sozinho
- Testes podem ser reduzidos ao mínimo viável
- Deploy direto em produção permitido com monitoramento intensivo
- Documentação retroativa em até 24 horas

---

## 5. Patching de Agentes (Endpoints Gerenciados)

### 5.1 Responsabilidade

| Componente | Quem Aplica | Método |
|-----------|------------|--------|
| Agente CyberShield | CyberShield (auto-update) | Atualização automática assinada |
| SO do endpoint (Windows/macOS) | Cliente MSP via CyberShield | Jobs de patching programados |
| Aplicações de terceiros | Cliente MSP | Inventário + políticas |

### 5.2 Janelas de Manutenção

| Tipo | Janela Padrão | Flexibilidade |
|------|:------------:|:------------:|
| Patches de SO | Sáb/Dom 02:00-06:00 (local) | Configurável por tenant |
| Updates do agente | Graduais (canary → full) | 24-72h de rollout |
| Patches emergenciais | Imediato | Notificação prévia quando possível |

### 5.3 Blast Radius

- Updates do agente seguem modelo canary (5% → 25% → 100%)
- Configuração de blast radius adaptativo por tenant
- Rollback automático se taxa de erro > 5%
- Referência: `adaptive_blast_radius_config`

---

## 6. Monitoramento e Métricas

### 6.1 KPIs de Patching

| Métrica | Meta | Medição |
|---------|------|---------|
| Tempo médio de aplicação (emergencial) | < 24h | Por incidente |
| Tempo médio de aplicação (crítico) | < 72h | Mensal |
| % de sistemas atualizados | > 95% | Semanal |
| Vulnerabilidades abertas > 30 dias | 0 (críticas) | Semanal |
| Taxa de rollback | < 5% | Mensal |

### 6.2 Ferramentas de Monitoramento

| Ferramenta | Função |
|-----------|--------|
| npm audit | Vulnerabilidades em dependências JS |
| Dependabot | PRs automáticos de atualização |
| CVE feeds (NVD) | Novas vulnerabilidades publicadas |
| Agent inventory | Versões instaladas por endpoint |
| Security scan | Scan periódico de vulnerabilidades |

---

## 7. Documentação e Auditoria

### 7.1 Registro de Patches

Cada aplicação de patch deve ser registrada com:
- CVE/advisory associado
- Componente afetado
- Versão anterior → nova versão
- Data de aplicação
- Resultado (sucesso/falha/rollback)
- Responsável

### 7.2 Trilha de Auditoria

| Evento | Registro | Retenção |
|--------|---------|----------|
| Patch identificado | `security_events` | 7 anos |
| Patch aplicado | `audit_logs` | 7 anos |
| Patch falhado | `audit_logs` + alerta | 7 anos |
| Exceção concedida | Ticket documentado | 3 anos |

---

## 8. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Scan de vulnerabilidades | npm audit, Dependabot | PRs automáticos |
| SLA de patching | Classificação por CVSS | Métricas de compliance |
| Teste pré-deploy | Pipeline CI/CD | Logs de teste |
| Rollback | Versionamento + rollback plan | Procedimento documentado |
| Auditoria | Registro de todas as aplicações | `audit_logs` |

---

## 9. Conformidade

| Framework | Controle | Status |
|-----------|----------|:------:|
| SOC 2 | CC6.7 — Threat management | ✅ |
| SOC 2 | CC7.1 — Infrastructure monitoring | ✅ |
| LGPD | Art. 46 — Medidas de segurança | ✅ |
| CIS | Control 7 — Continuous Vulnerability Management | ✅ |

---

## Referências

- [Política de Gestão de Vulnerabilidades](./12_vulnerability_management_policy.md) (VMP-001)
- [Política de Gestão de Mudanças](./03_change_management_policy.md) (CMP-001)
- [CAB Charter](../compliance/cab_charter.md)
- [Política de Desenvolvimento Seguro](./09_secure_development_policy.md)

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-03-05 | CyberShield Security | Versão inicial |
