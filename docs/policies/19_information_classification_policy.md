# Política de Classificação da Informação

| Campo | Valor |
|-------|-------|
| **Código** | ICL-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2026-03-05 |
| **Revisão** | 2027-03-05 |
| **Critério SOC 2** | CC1.3, CC5.2, CC6.1 |

---

## 1. Objetivo

Definir critérios formais para classificação, rotulagem e manuseio de informações com base no nível de sensibilidade, garantindo proteção proporcional ao risco.

---

## 2. Escopo

Toda informação criada, recebida, armazenada, processada ou transmitida pelo CyberShield, incluindo:
- Dados em bancos de dados
- Documentos internos e externos
- Código-fonte
- Comunicações (email, chat)
- Backups e arquivos
- Dados coletados por agentes

---

## 3. Níveis de Classificação

### 3.1 Definições

| Nível | Rótulo | Cor | Descrição | Impacto se Exposto |
|:-----:|--------|:---:|-----------|-------------------|
| **1** | 🟢 Público | Verde | Informação aprovada para divulgação pública | Nenhum |
| **2** | 🔵 Interno | Azul | Informação de uso interno, não sensível | Baixo — inconveniência operacional |
| **3** | 🟡 Confidencial | Amarelo | Informação sensível de negócio ou dados pessoais | Médio — dano financeiro ou regulatório |
| **4** | 🔴 Restrito | Vermelho | Informação altamente sensível, acesso mínimo | Alto — dano severo, legal ou de segurança |

### 3.2 Exemplos por Nível

| Nível | Exemplos |
|:-----:|---------|
| 🟢 Público | Conteúdo de marketing, página de status, documentação pública, changelog |
| 🔵 Interno | Documentação técnica, procedimentos operacionais, métricas de performance agregadas |
| 🟡 Confidencial | Dados de clientes, dados pessoais (LGPD), código-fonte, configurações de segurança, logs de auditoria |
| 🔴 Restrito | Credenciais, chaves criptográficas, HMAC secrets, tokens de API, dados de investigação de incidentes, backups não criptografados |

---

## 4. Controles por Nível

### 4.1 Matriz de Controles

| Controle | 🟢 Público | 🔵 Interno | 🟡 Confidencial | 🔴 Restrito |
|----------|:----------:|:----------:|:----------------:|:-----------:|
| Criptografia em repouso | — | Opcional | Obrigatório | Obrigatório |
| Criptografia em trânsito | TLS | TLS | TLS 1.3 | TLS 1.3 + mTLS |
| Controle de acesso | Nenhum | Autenticação | RBAC + RLS | RBAC + RLS + MFA |
| Registro em audit log | — | Opcional | Obrigatório | Obrigatório (imutável) |
| Compartilhamento externo | Livre | Com aprovação | NDA obrigatório | Proibido (exceto legal) |
| Impressão | Livre | Permitido | Controlado | Proibido |
| Backup | Padrão | Padrão | Criptografado | Criptografado + isolado |
| Retenção | Sem requisito | 1 ano | Conforme DRP-001 | Conforme DRP-001 |
| Exclusão | Normal | Normal | Segura (overwrite) | Segura + certificada |

### 4.2 Controles de Acesso por Nível

| Nível | Quem Pode Acessar | Aprovação |
|:-----:|-------------------|-----------|
| 🟢 Público | Qualquer pessoa | Nenhuma |
| 🔵 Interno | Funcionários e colaboradores autenticados | Autenticação |
| 🟡 Confidencial | Apenas roles autorizados (need-to-know) | Role assignment |
| 🔴 Restrito | Apenas indivíduos nomeados | Security Officer + justificativa |

---

## 5. Classificação de Dados no CyberShield

### 5.1 Dados por Tabela

| Tabela / Dado | Classificação | Justificativa |
|---------------|:------------:|--------------|
| `agents` (hostname, IP) | 🟡 Confidencial | Dados operacionais de clientes |
| `agents` (hmac_secret) | 🔴 Restrito | Credencial de autenticação |
| `audit_logs` | 🟡 Confidencial | Contém user IDs e ações |
| `security_events` | 🟡 Confidencial | Dados de segurança |
| `user_roles` | 🟡 Confidencial | Controle de acesso |
| `enrollment_keys` (key_value) | 🔴 Restrito | Credencial de enrollment |
| `profiles` (nome, email) | 🟡 Confidencial | Dados pessoais (LGPD) |
| `tenants` (configuração) | 🔵 Interno | Configuração operacional |
| `agent_system_metrics` | 🔵 Interno | Métricas técnicas |
| `agent_certificates` | 🟡 Confidencial | Informação de segurança |
| Documentação pública | 🟢 Público | Aprovada para divulgação |
| Código-fonte | 🟡 Confidencial | Propriedade intelectual |
| Chaves ECDSA | 🔴 Restrito | Material criptográfico |

---

## 6. Rotulagem

### 6.1 Requisitos de Rotulagem

| Tipo de Informação | Método de Rotulagem |
|-------------------|-------------------|
| Documentos (Markdown, PDF) | Header com nível: `Classificação: CONFIDENCIAL` |
| Emails | Prefixo no assunto: `[RESTRITO]`, `[CONFIDENCIAL]` |
| Código-fonte | Comentário no topo do arquivo |
| Banco de dados | Documentação de schema (este documento) |
| APIs | Header de resposta ou documentação |
| Backups | Nome do arquivo com classificação |

### 6.2 Template de Rotulagem

```
---
Classificação: [PÚBLICO | INTERNO | CONFIDENCIAL | RESTRITO]
Proprietário: [Equipe responsável]
Data de classificação: [DD/MM/AAAA]
Revisão: [DD/MM/AAAA]
---
```

---

## 7. Ciclo de Vida da Classificação

### 7.1 Responsabilidades

| Fase | Responsável | Ação |
|------|------------|------|
| Criação | Autor do dado/documento | Classificar no momento da criação |
| Revisão | Proprietário do dado | Revisar classificação anualmente |
| Reclassificação | Security Officer | Aprovar mudanças de nível |
| Destruição | Infraestrutura | Seguir método de exclusão do nível |

### 7.2 Reclassificação

- Informação pode ser **promovida** (nível mais alto) a qualquer momento
- **Rebaixamento** requer aprovação do Security Officer
- Mudanças são registradas em audit log

---

## 8. Incidentes de Classificação

### 8.1 Violações

| Tipo de Violação | Exemplo | Ação |
|-----------------|---------|------|
| Exposição acidental | Email confidencial enviado para lista errada | Contenção + registro |
| Classificação incorreta | Dado restrito marcado como interno | Correção + treinamento |
| Compartilhamento não autorizado | Dado confidencial em repositório público | Incidente de segurança P2+ |

---

## 9. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Classificação | Mapa de dados (Seção 5) | Este documento |
| Criptografia | AES-256 + TLS 1.3 | Configuração de infraestrutura |
| Controle de acesso | RBAC + RLS | `user_roles`, RLS policies |
| Auditoria | Logs imutáveis | `audit_logs` |
| Rotulagem | Templates documentados | Seção 6 |

---

## 10. Conformidade

| Framework | Controle | Status |
|-----------|----------|:------:|
| SOC 2 | CC1.3 — Organizational structure | ✅ |
| SOC 2 | CC5.2 — Risk-based controls | ✅ |
| SOC 2 | CC6.1 — Logical access | ✅ |
| LGPD | Art. 46 — Medidas de segurança | ✅ |
| ISO 27001 | A.8.2 — Information classification | ✅ |

---

## Referências

- [Política de Retenção de Dados](./06_data_retention_policy.md) (DRP-001)
- [Política de Criptografia](./11_cryptography_policy.md) (CRP-001)
- [Política de Controle de Acesso](./02_access_control_policy.md) (ACP-001)
- [ROPA](../compliance/ROPA.md)

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-03-05 | CyberShield Security | Versão inicial |
