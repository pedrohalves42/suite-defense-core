# RIPD — Relatório de Impacto à Proteção de Dados Pessoais

| Campo | Valor |
|-------|-------|
| **Código** | RIPD-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | DPO |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Base Legal** | LGPD Art. 38 / GDPR Art. 35 |

---

## 1. Identificação do Tratamento

| Campo | Descrição |
|-------|-----------|
| **Nome** | Monitoramento de Segurança de Endpoints via Agente CyberShield |
| **Descrição** | Coleta automatizada de dados de segurança (telemetria, processos, status de AV/FW, integridade de arquivos) de estações de trabalho Windows para detecção e resposta a ameaças |
| **Controlador** | CyberShield LTDA |
| **Operadores** | MSPs (Managed Service Providers) que utilizam a plataforma |
| **DPO** | dpo@cybershield.com.br |

---

## 2. Necessidade e Proporcionalidade

### 2.1 Finalidade do Tratamento
- Detectar ameaças cibernéticas em tempo real nos endpoints monitorados
- Garantir a conformidade de segurança (antivírus, firewall, patches)
- Permitir resposta automatizada a incidentes (SOAR)
- Fornecer evidências forenses em caso de incidentes

### 2.2 Teste de Necessidade

| Pergunta | Resposta |
|----------|---------|
| O tratamento é necessário para a finalidade? | **Sim** — monitoramento de segurança requer coleta de telemetria |
| Existem alternativas menos intrusivas? | **Não** — dados técnicos de segurança são o mínimo necessário |
| A quantidade de dados é proporcional? | **Sim** — apenas dados de segurança, sem conteúdo pessoal |
| Os dados são adequados? | **Sim** — estritamente técnicos (processos, status, hashes) |

### 2.3 Base Legal
- **Principal:** Legítimo Interesse (Art. 7º, IX) — proteção de ativos de TI
- **Complementar:** Execução Contratual (Art. 7º, V) — contrato MSP↔CyberShield
- **Emergencial:** Proteção à Vida (Art. 7º, VII) — resposta a ameaças críticas

---

## 3. Identificação de Riscos

### 3.1 Matriz de Riscos

| ID | Risco | Probabilidade | Impacto | Nível | Controle Mitigador |
|----|-------|:------------:|:-------:|:-----:|---------------------|
| R1 | Acesso não autorizado a dados de telemetria | Baixa | Alto | **Médio** | RLS multi-tenant, RBAC, MFA |
| R2 | Vazamento entre tenants (cross-tenant leak) | Muito Baixa | Crítico | **Médio** | RLS em 100% das tabelas, views security_invoker |
| R3 | Interceptação de dados em trânsito | Baixa | Alto | **Médio** | TLS 1.3, HMAC-SHA256 |
| R4 | Comprometimento do agente (supply chain) | Baixa | Crítico | **Alto** | Ed25519, SHA-256, TOCTOU |
| R5 | Uso indevido de dados pelo operador MSP | Média | Médio | **Médio** | Audit trail imutável, RBAC |
| R6 | Retenção excessiva de dados | Baixa | Baixo | **Baixo** | Política de retenção automatizada |
| R7 | Transferência internacional insegura | Baixa | Médio | **Médio** | SCCs, criptografia E2E |
| R8 | Acesso não autorizado a logs de auditoria | Muito Baixa | Alto | **Baixo** | Triggers de imutabilidade, TRUNCATE revogado |
| R9 | Execução de comandos maliciosos nos endpoints | Baixa | Crítico | **Alto** | Ed25519 fail-closed, circuit breaker |
| R10 | Perda de dados pessoais | Baixa | Alto | **Médio** | Backups automáticos, DRP |

### 3.2 Escala de Avaliação

| Probabilidade | Valor | Impacto | Valor |
|:-------------:|:-----:|:-------:|:-----:|
| Muito Baixa | 1 | Baixo | 1 |
| Baixa | 2 | Médio | 2 |
| Média | 3 | Alto | 3 |
| Alta | 4 | Crítico | 4 |

**Nível de Risco = Probabilidade × Impacto**
- 1-3: Baixo (verde) | 4-6: Médio (amarelo) | 8-9: Alto (laranja) | 12-16: Crítico (vermelho)

---

## 4. Medidas de Mitigação

### 4.1 Controles Técnicos

| Risco | Controle | Implementação | Eficácia |
|-------|----------|--------------|----------|
| R1, R2 | Row Level Security (RLS) | Todas as tabelas com tenant_id | Alta |
| R1 | RBAC + MFA | `user_roles` + autenticação multi-fator | Alta |
| R2 | Security Invoker Views | `security_invoker=on`, `security_barrier=true` | Alta |
| R3 | HMAC + TLS | Assinatura de toda comunicação agente→servidor | Alta |
| R4 | Ed25519 Digital Signatures | Assinatura obrigatória de releases e jobs | Alta |
| R4 | TOCTOU Protection | Verificação contínua de integridade do script | Alta |
| R5 | Audit Trail Imutável | Triggers `BEFORE UPDATE/DELETE`, hash encadeado | Alta |
| R6 | Retenção Automatizada | Policies de TTL com limpeza programática | Média |
| R7 | Criptografia E2E | AES-256 em repouso, TLS 1.3 em trânsito | Alta |
| R8 | Triggers de Proteção | `TRUNCATE` revogado em tabelas de auditoria | Alta |
| R9 | Circuit Breaker | Pausa automática se >30% da frota impactada | Alta |
| R10 | Backup + DRP | Backups diários com teste de restauração | Média |

### 4.2 Controles Organizacionais

| Controle | Descrição |
|----------|-----------|
| Política de Acesso Mínimo | Least privilege em todos os níveis |
| Treinamento de Segurança | Programa obrigatório para equipe |
| Revisão de Acessos | Trimestral |
| Gestão de Incidentes | PRI com playbooks específicos |
| DPA com Sub-processadores | Contratos com Lovable Cloud e Stripe |

---

## 5. Avaliação de Risco Residual

| Risco | Nível Original | Após Mitigação | Status |
|-------|:--------------:|:--------------:|--------|
| R1 | Médio | **Baixo** | ✅ Aceitável |
| R2 | Médio | **Baixo** | ✅ Aceitável |
| R3 | Médio | **Baixo** | ✅ Aceitável |
| R4 | Alto | **Médio** | ✅ Aceitável (com monitoramento) |
| R5 | Médio | **Baixo** | ✅ Aceitável |
| R6 | Baixo | **Baixo** | ✅ Aceitável |
| R7 | Médio | **Baixo** | ✅ Aceitável |
| R8 | Baixo | **Muito Baixo** | ✅ Aceitável |
| R9 | Alto | **Baixo** | ✅ Aceitável |
| R10 | Médio | **Baixo** | ✅ Aceitável |

---

## 6. Parecer do DPO

Com base na análise realizada, o tratamento de dados pessoais pelo CyberShield:

1. **É necessário e proporcional** — coleta limitada a dados técnicos de segurança
2. **Possui base legal adequada** — legítimo interesse com LIA documentada
3. **Implementa controles robustos** — múltiplas camadas de proteção técnica e organizacional
4. **Risco residual é aceitável** — todos os riscos mitigados para nível baixo ou aceitável

**Recomendação:** Tratamento aprovado com as seguintes condições:
- Manutenção dos controles técnicos descritos
- Revisão anual deste RIPD
- Monitoramento contínuo de novos riscos
- Comunicação transparente aos titulares

---

## 7. Consulta à ANPD

Conforme Art. 38, §1º, a consulta prévia à ANPD não é necessária neste caso, pois os riscos residuais foram mitigados a níveis aceitáveis. Caso a ANPD solicite, este documento será prontamente disponibilizado.

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield DPO | Avaliação inicial — 10 riscos mapeados |
