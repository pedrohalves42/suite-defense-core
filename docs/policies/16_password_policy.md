# Política de Senhas

| Campo | Valor |
|-------|-------|
| **Código** | PWD-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2026-03-05 |
| **Revisão** | 2027-03-05 |
| **Critério SOC 2** | CC6.1, CC6.2 |

---

## 1. Objetivo

Estabelecer requisitos formais para criação, armazenamento, rotação e proteção de senhas em todos os sistemas do CyberShield, garantindo conformidade com SOC 2 CC6.1 e boas práticas de segurança (NIST SP 800-63B).

---

## 2. Escopo

Esta política se aplica a:
- Todos os usuários do sistema (operadores, administradores, super admins)
- Contas de serviço e API keys
- Credenciais de acesso ao banco de dados
- Chaves de enrollment de agentes
- Senhas de acesso a sistemas de terceiros

---

## 3. Requisitos de Complexidade

### 3.1 Senhas de Usuários

| Requisito | Valor |
|-----------|-------|
| Comprimento mínimo | 12 caracteres |
| Letras maiúsculas | Mínimo 1 |
| Letras minúsculas | Mínimo 1 |
| Números | Mínimo 1 |
| Caracteres especiais | Mínimo 1 (!@#$%^&*) |
| Senhas anteriores bloqueadas | Últimas 12 |
| Palavras de dicionário | Bloqueadas |
| Dados pessoais (nome, email) | Bloqueados |

### 3.2 Contas Privilegiadas (Admin / Super Admin)

| Requisito | Valor |
|-----------|-------|
| Comprimento mínimo | 16 caracteres |
| MFA obrigatório | Sim (TOTP ou WebAuthn) |
| Sessão máxima | 8 horas |
| Re-autenticação para ações críticas | Sim |

### 3.3 Contas de Serviço e API Keys

| Requisito | Valor |
|-----------|-------|
| Comprimento mínimo | 32 caracteres (gerados automaticamente) |
| Rotação | A cada 90 dias |
| Armazenamento | Vault / variáveis de ambiente criptografadas |
| Compartilhamento | Proibido |

---

## 4. Rotação de Senhas

### 4.1 Cronograma de Rotação

| Tipo de Conta | Frequência | Método |
|---------------|-----------|--------|
| Usuários regulares | 90 dias (recomendado) | Notificação por email |
| Administradores | 60 dias (obrigatório) | Forçado pelo sistema |
| Super Admins | 30 dias (obrigatório) | Forçado pelo sistema |
| Contas de serviço | 90 dias | Rotação automatizada |
| HMAC secrets (agentes) | 180 dias | Runbook de rotação |

### 4.2 Rotação Forçada

Rotação imediata é obrigatória nos seguintes cenários:
- Suspeita de comprometimento de credenciais
- Desligamento de funcionário com acesso privilegiado
- Detecção de credential stuffing ou brute force
- Após incidente de segurança classificado como P1 ou P2
- Violação de dados confirmada

---

## 5. Armazenamento de Senhas

### 5.1 Requisitos de Armazenamento

| Controle | Implementação |
|----------|--------------|
| Algoritmo de hash | bcrypt (cost factor ≥ 12) |
| Armazenamento em texto plano | **Estritamente proibido** |
| Salt | Único por senha (mínimo 16 bytes) |
| Pepper | Aplicado via configuração do servidor |
| Transmissão | Apenas via TLS 1.3 |
| Logs | Senhas **nunca** são registradas em logs |

### 5.2 Gerenciadores de Senha

- Uso de gerenciador de senhas corporativo é **obrigatório** para equipes internas
- Senhas não devem ser armazenadas em planilhas, documentos ou post-its
- Compartilhamento de senhas é proibido — usar contas individuais

---

## 6. Autenticação Multifator (MFA)

### 6.1 Requisitos de MFA

| Nível de Acesso | MFA Obrigatório | Métodos Aceitos |
|----------------|:--------------:|----------------|
| Super Admin | ✅ | TOTP, WebAuthn/FIDO2 |
| Admin | ✅ | TOTP, WebAuthn/FIDO2 |
| Operador | ✅ | TOTP, WebAuthn/FIDO2, SMS* |
| API / Serviço | N/A | HMAC, JWT com rotação |

> *SMS apenas como fallback temporário — deve migrar para TOTP em 30 dias.

### 6.2 Recuperação de MFA

- Procedimento de break glass documentado em `docs/procedures/break_glass_procedure.md`
- Requer aprovação de 2 administradores
- Evento registrado em audit_logs com severidade "high"

---

## 7. Bloqueio de Conta

### 7.1 Política de Bloqueio

| Controle | Valor |
|----------|-------|
| Tentativas máximas antes do bloqueio | 5 |
| Duração do bloqueio | 30 minutos (progressivo) |
| Notificação ao usuário | Sim (email) |
| Notificação ao admin | Após 3 bloqueios em 24h |
| Bloqueio permanente | Após 10 bloqueios em 7 dias |

### 7.2 Detecção de Ataques

- Monitoramento de credential stuffing via rate limiting
- Alertas de brute force por IP e por conta
- Integração com circuit breaker global (`check_global_circuit_breaker`)

---

## 8. Senhas Proibidas

### 8.1 Lista de Bloqueio

- Top 10.000 senhas mais comuns (Have I Been Pwned)
- Variações do nome da empresa (cybershield, CyberShield123, etc.)
- Sequências simples (123456, qwerty, abcdef)
- Senhas iguais ao username ou email
- Senhas anteriormente comprometidas em data breaches públicos

---

## 9. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| Complexidade | Validação no auth system | Configuração de auth |
| Hashing | bcrypt cost 12+ | Código de autenticação |
| MFA | TOTP obrigatório | `mfa_factors`, `mfa_verification_logs` |
| Bloqueio | Rate limiting | `failed_login_attempts`, circuit breaker |
| Rotação | Política de expiração | Notificações automáticas |
| Auditoria | Login events | `audit_logs` |

---

## 10. Conformidade

| Framework | Controle | Status |
|-----------|----------|:------:|
| SOC 2 | CC6.1 — Logical access controls | ✅ |
| SOC 2 | CC6.2 — Authentication mechanisms | ✅ |
| LGPD | Art. 46 — Medidas de segurança | ✅ |
| NIST | SP 800-63B — Digital Identity | ✅ |
| CIS | Controls 5.2, 5.3 | ✅ |

---

## 11. Responsabilidades

| Papel | Responsabilidade |
|-------|-----------------|
| Usuários | Criar senhas fortes, não compartilhar, reportar suspeitas |
| Administradores | Configurar políticas, monitorar bloqueios, aprovar resets |
| Security Officer | Revisar política anualmente, auditar conformidade |
| Engenharia | Implementar controles técnicos, manter hashing atualizado |

---

## 12. Exceções

Exceções a esta política devem ser:
1. Solicitadas formalmente via ticket
2. Aprovadas pelo Security Officer
3. Documentadas com justificativa e prazo
4. Revisadas trimestralmente
5. Limitadas a no máximo 90 dias

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-03-05 | CyberShield Security | Versão inicial |
