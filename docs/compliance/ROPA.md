# ROPA — Registro de Atividades de Tratamento de Dados Pessoais

| Campo | Valor |
|-------|-------|
| **Código** | ROPA-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | DPO / Encarregado de Proteção de Dados |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Base Legal** | LGPD Art. 37 |

---

## 1. Objetivo

Manter um registro completo e atualizado de todas as operações de tratamento de dados pessoais realizadas pelo CyberShield, conforme exigido pelo Art. 37 da LGPD e boas práticas internacionais (GDPR Art. 30).

---

## 2. Inventário de Tratamentos

### 2.1 Coleta de Telemetria de Segurança

| Campo | Valor |
|-------|-------|
| **ID do Tratamento** | TRT-001 |
| **Atividade** | Coleta de dados de segurança dos endpoints |
| **Finalidade** | Monitoramento de segurança cibernética, detecção de ameaças |
| **Base Legal** | Legítimo Interesse (Art. 7º, IX) |
| **Categorias de Dados** | Hostname, IP, usuário logado, processos, status de AV/FW |
| **Categorias de Titulares** | Funcionários dos clientes MSP |
| **Fonte** | Agente CyberShield instalado no endpoint |
| **Destinatários** | MSP administrador (via dashboard) |
| **Transferência Internacional** | Sim — EUA (AWS) |
| **Salvaguardas** | TLS 1.3, AES-256, RLS multi-tenant |
| **Retenção** | 90-365 dias conforme tipo de dado |
| **RIPD Necessária?** | Sim (RIPD-001) |

### 2.2 Autenticação e Acesso à Plataforma

| Campo | Valor |
|-------|-------|
| **ID do Tratamento** | TRT-002 |
| **Atividade** | Gestão de identidade e acesso de operadores |
| **Finalidade** | Autenticação, autorização e auditoria de acesso |
| **Base Legal** | Execução Contratual (Art. 7º, V) |
| **Categorias de Dados** | Nome, email, IP de acesso, logs de sessão |
| **Categorias de Titulares** | Operadores MSP, administradores |
| **Fonte** | Formulário de cadastro e login |
| **Destinatários** | Internos (equipe de suporte, segurança) |
| **Transferência Internacional** | Sim — EUA (AWS) |
| **Salvaguardas** | MFA, JWT tokens, sessões com expiração |
| **Retenção** | Duração do contrato + 90 dias |
| **RIPD Necessária?** | Não |

### 2.3 Processamento de Pagamentos

| Campo | Valor |
|-------|-------|
| **ID do Tratamento** | TRT-003 |
| **Atividade** | Cobrança e faturamento |
| **Finalidade** | Execução de contrato de prestação de serviço |
| **Base Legal** | Execução Contratual (Art. 7º, V) |
| **Categorias de Dados** | Nome, email, dados de pagamento (via Stripe) |
| **Categorias de Titulares** | Responsáveis financeiros dos MSPs |
| **Fonte** | Formulário de checkout (Stripe) |
| **Destinatários** | Stripe Inc. (sub-processador) |
| **Transferência Internacional** | Sim — EUA (Stripe) |
| **Salvaguardas** | PCI-DSS (Stripe), tokenização |
| **Retenção** | 5 anos (obrigação fiscal) |
| **RIPD Necessária?** | Não |

### 2.4 Auditoria e Logs de Segurança

| Campo | Valor |
|-------|-------|
| **ID do Tratamento** | TRT-004 |
| **Atividade** | Registro de ações e eventos de segurança |
| **Finalidade** | Compliance, investigação forense, auditoria |
| **Base Legal** | Obrigação Legal (Art. 7º, II) + Legítimo Interesse |
| **Categorias de Dados** | User ID, IP, ação realizada, timestamp, detalhes do evento |
| **Categorias de Titulares** | Todos os usuários da plataforma |
| **Fonte** | Sistema automático (triggers, Edge Functions) |
| **Destinatários** | Internos (auditoria, segurança) |
| **Transferência Internacional** | Sim — EUA (AWS) |
| **Salvaguardas** | Imutabilidade (triggers), hash encadeado, RLS |
| **Retenção** | 5 anos |
| **RIPD Necessária?** | Não |

### 2.5 Inventário de Dispositivos e Certificados

| Campo | Valor |
|-------|-------|
| **ID do Tratamento** | TRT-005 |
| **Atividade** | Coleta de informações de hardware, software e certificados |
| **Finalidade** | Gestão de ativos e compliance de segurança |
| **Base Legal** | Legítimo Interesse (Art. 7º, IX) |
| **Categorias de Dados** | OS version, disco, RAM, certificados, MAC address |
| **Categorias de Titulares** | Indiretamente — dispositivos de funcionários |
| **Fonte** | Agente CyberShield |
| **Destinatários** | MSP administrador (via dashboard) |
| **Transferência Internacional** | Sim — EUA |
| **Salvaguardas** | RLS, HMAC, pseudonimização |
| **Retenção** | 180 dias |
| **RIPD Necessária?** | Não |

### 2.6 Resposta Automatizada a Incidentes (SOAR)

| Campo | Valor |
|-------|-------|
| **ID do Tratamento** | TRT-006 |
| **Atividade** | Execução automatizada de remediação de segurança |
| **Finalidade** | Proteção proativa de endpoints |
| **Base Legal** | Legítimo Interesse (Art. 7º, IX) + Proteção à Vida (Art. 7º, VII) |
| **Categorias de Dados** | Processos suspeitos, status de firewall, dispositivos USB |
| **Categorias de Titulares** | Funcionários dos clientes MSP |
| **Fonte** | Agente CyberShield + SOAR Engine |
| **Destinatários** | MSP (logs de remediação) |
| **Transferência Internacional** | Sim — EUA |
| **Salvaguardas** | Blast radius limits, circuit breaker, approval workflow (HITL) |
| **Retenção** | 365 dias |
| **RIPD Necessária?** | Sim (RIPD-001) |

---

## 3. Fluxo de Dados

```
Endpoints (Agente)
  → [HMAC + TLS 1.3] →
    Edge Functions (Validação + RLS)
      → [RLS Isolation] →
        Database (CyberShield Cloud/AWS US)
          → [Dashboard] →
            MSP Operador (browser)

Stripe (Pagamentos)
  ← [Tokenizado] ←
    Checkout CyberShield
```

---

## 4. Sub-processadores

| Sub-processador | País | Dados | DPA | Certificações |
|----------------|------|-------|-----|---------------|
| CyberShield Cloud (Supabase) | EUA | Todos os dados da plataforma | Sim | SOC 2 Type II |
| Stripe | EUA | Dados de pagamento | Sim | PCI-DSS Level 1 |
| GitHub Actions | EUA | Hashes de builds, metadados | Sim | SOC 2 |

---

## 5. Revisão e Manutenção

- Este ROPA é revisado **semestralmente** ou quando novos tratamentos forem adicionados
- Novos tratamentos devem ser registrados **antes** da implementação
- O DPO é responsável pela manutenção e disponibilidade para a ANPD

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield DPO | Versão inicial — 6 tratamentos mapeados |
