# Registro de Consentimento (LGPD)

| Campo | Valor |
|-------|-------|
| **Código** | RCO-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | DPO |
| **Data Efetiva** | 2026-03-05 |
| **Revisão** | 2027-03-05 |
| **Critério LGPD** | Art. 7º, Art. 8º |

---

## 1. Objetivo

Documentar as bases legais para cada atividade de tratamento de dados pessoais realizada pelo CyberShield, servindo como evidência de conformidade com a LGPD (Art. 7º e 8º) e complementando o ROPA (Records of Processing Activities).

---

## 2. Escopo

Abrange todos os tratamentos de dados pessoais realizados pelo CyberShield em qualquer capacidade (controlador ou operador), incluindo dados de:
- Usuários da plataforma (operadores MSP)
- Titulares cujos dados são coletados via agentes
- Visitantes do site
- Funcionários e colaboradores

---

## 3. Bases Legais Aplicáveis (LGPD Art. 7º)

| Base Legal | Artigo | Uso pelo CyberShield |
|-----------|--------|---------------------|
| Consentimento | Art. 7º, I | Cookies não essenciais, marketing |
| Obrigação legal/regulatória | Art. 7º, II | Retenção de logs de auditoria |
| Execução de contrato | Art. 7º, V | Prestação do serviço SaaS |
| Exercício regular de direitos | Art. 7º, VI | Defesa em processos |
| Legítimo interesse | Art. 7º, IX | Segurança da informação, prevenção de fraudes |
| Proteção do crédito | Art. 7º, X | N/A |

---

## 4. Registro por Atividade de Tratamento

### 4.1 Cadastro e Autenticação de Usuários

| Campo | Valor |
|-------|-------|
| **Atividade** | Cadastro e login de operadores MSP |
| **Dados tratados** | Nome, email, senha (hash), IP, user agent |
| **Base legal** | Execução de contrato (Art. 7º, V) |
| **Justificativa** | Necessário para prestação do serviço contratado |
| **Consentimento explícito** | Não necessário (base contratual) |
| **Retenção** | Enquanto conta ativa + 5 anos após exclusão |
| **Compartilhamento** | Não |

### 4.2 Coleta de Dados de Endpoints (via Agente)

| Campo | Valor |
|-------|-------|
| **Atividade** | Inventário de hardware, software e métricas de segurança |
| **Dados tratados** | Hostname, IP, SO, software instalado, métricas de sistema |
| **Base legal** | Execução de contrato (Art. 7º, V) + Legítimo interesse (Art. 7º, IX) |
| **Justificativa** | Core do serviço contratado pelo MSP; segurança dos endpoints |
| **Consentimento explícito** | Não necessário — contrato MSP cobre |
| **Retenção** | Enquanto agente ativo + conforme DRP-001 |
| **Compartilhamento** | Apenas com o tenant (MSP) proprietário do agente |
| **LIA realizada** | Sim (ref. PDP-001 §13) |

### 4.3 Logs de Auditoria

| Campo | Valor |
|-------|-------|
| **Atividade** | Registro de ações de usuários para auditoria |
| **Dados tratados** | User ID, IP, ação realizada, timestamp |
| **Base legal** | Obrigação legal (Art. 7º, II) + Legítimo interesse (Art. 7º, IX) |
| **Justificativa** | SOC 2 exige trilha de auditoria; LGPD Art. 46 exige medidas de segurança |
| **Consentimento explícito** | Não necessário (obrigação legal) |
| **Retenção** | 7 anos |
| **Compartilhamento** | Auditores sob NDA |

### 4.4 Eventos de Segurança

| Campo | Valor |
|-------|-------|
| **Atividade** | Detecção e registro de eventos de segurança em endpoints |
| **Dados tratados** | Agent ID, hostname, tipo de evento, severidade, detalhes técnicos |
| **Base legal** | Legítimo interesse (Art. 7º, IX) |
| **Justificativa** | Proteção contra ameaças de segurança — core do serviço |
| **Consentimento explícito** | Não necessário |
| **Retenção** | 7 anos |
| **LIA realizada** | Sim |

### 4.5 Comunicações por Email

| Campo | Valor |
|-------|-------|
| **Atividade** | Envio de notificações de sistema, alertas e comunicações |
| **Dados tratados** | Email, nome |
| **Base legal** | Execução de contrato (Art. 7º, V) — notificações de serviço |
| **Consentimento explícito** | Sim — para newsletters/marketing |
| **Retenção** | Enquanto conta ativa |
| **Opt-out disponível** | Sim (para marketing) |

### 4.6 Cookies e Analytics

| Campo | Valor |
|-------|-------|
| **Atividade** | Cookies de sessão e analytics do site |
| **Dados tratados** | Cookies de sessão, IP anonimizado, páginas visitadas |
| **Base legal** | Consentimento (Art. 7º, I) — para analytics; Legítimo interesse — para cookies essenciais |
| **Consentimento explícito** | Sim — via cookie banner para cookies não essenciais |
| **Retenção** | Sessão (essenciais); 13 meses (analytics) |
| **Opt-out disponível** | Sim (cookie banner) |

### 4.7 Dados de Certificados de Endpoints

| Campo | Valor |
|-------|-------|
| **Atividade** | Inventário de certificados digitais instalados nos endpoints |
| **Dados tratados** | Subject, issuer, thumbprint, validade |
| **Base legal** | Execução de contrato (Art. 7º, V) |
| **Justificativa** | Gestão de segurança de endpoints contratada |
| **Consentimento explícito** | Não necessário |
| **Retenção** | 2 anos |

### 4.8 Métricas de Sistema (CPU, Disco, Memória)

| Campo | Valor |
|-------|-------|
| **Atividade** | Coleta de métricas de performance de endpoints |
| **Dados tratados** | CPU %, RAM %, disco %, temperaturas |
| **Base legal** | Execução de contrato (Art. 7º, V) |
| **Justificativa** | Monitoramento de saúde dos endpoints contratado |
| **Consentimento explícito** | Não necessário |
| **Retenção** | 1 ano |

---

## 5. Gestão de Consentimento

### 5.1 Quando Consentimento é Necessário

| Tratamento | Consentimento? | Método |
|-----------|:--------------:|--------|
| Prestação do serviço core | Não (contratual) | Aceite de ToS |
| Notificações de sistema | Não (contratual) | Automático |
| Email marketing | **Sim** | Opt-in explícito |
| Cookies de analytics | **Sim** | Cookie banner |
| Compartilhamento com terceiros | **Sim** (se fora do contrato) | Consentimento específico |

### 5.2 Requisitos de Consentimento (Art. 8º)

Quando consentimento é a base legal:
- Deve ser **livre, informado, inequívoco e para finalidade determinada**
- Registro de: quem consentiu, quando, para quê, como
- Revogação deve ser tão fácil quanto a concessão
- Consentimento de menores: representante legal (Art. 14)

### 5.3 Registro Técnico de Consentimento

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `consent_id` | UUID | Identificador único |
| `user_id` | UUID | Titular que concedeu |
| `purpose` | string | Finalidade específica |
| `granted_at` | timestamp | Data/hora da concessão |
| `revoked_at` | timestamp | Data/hora da revogação (se aplicável) |
| `method` | string | Como foi coletado (banner, formulário, etc.) |
| `version` | string | Versão do texto de consentimento |
| `ip_address` | inet | IP no momento da concessão |
| `evidence` | jsonb | Evidência adicional (screenshot, checkbox, etc.) |

---

## 6. Direitos dos Titulares

### 6.1 Processos Implementados

| Direito (LGPD Art. 18) | Processo | SLA |
|------------------------|---------|:---:|
| Confirmação de tratamento | Consulta ao DPO | 5 dias úteis |
| Acesso aos dados | Exportação em JSON/CSV | 10 dias úteis |
| Correção | Edição via dashboard ou DPO | 5 dias úteis |
| Anonimização/bloqueio | Soft delete + anonimização | 10 dias úteis |
| Eliminação | Exclusão conforme DRP-001 | 15 dias úteis |
| Portabilidade | Exportação padronizada | 15 dias úteis |
| Revogação de consentimento | Opt-out imediato | Imediato |
| Informação sobre compartilhamento | Consulta ao DPO | 5 dias úteis |

---

## 7. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Base legal documentada | Este registro | RCO-001 |
| ROPA complementar | Registrado | `docs/compliance/ROPA.md` |
| LIA para legítimo interesse | Documentada | PDP-001 §13 |
| Registro de consentimento | Banco de dados | Tabela de consentimentos |
| Direitos dos titulares | Processo documentado | Seção 6 |

---

## 8. Conformidade

| Framework | Controle | Status |
|-----------|----------|:------:|
| LGPD | Art. 7º — Bases legais | ✅ |
| LGPD | Art. 8º — Consentimento | ✅ |
| LGPD | Art. 18 — Direitos dos titulares | ✅ |
| LGPD | Art. 37 — Registro de atividades | ✅ |
| SOC 2 | PI1.2 — Consent/choice | ✅ |

---

## Referências

- [ROPA](./ROPA.md) (ROPA-001)
- [DPIA / RIPD](./DPIA_RIPD.md)
- [Política de Privacidade LGPD](../policies/10_privacy_lgpd_policy.md) (PDP-001)
- [Política de Retenção de Dados](../policies/06_data_retention_policy.md) (DRP-001)
- [Termos de Serviço](../legal/terms_of_service.md)

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-03-05 | CyberShield Security | Versão inicial |
