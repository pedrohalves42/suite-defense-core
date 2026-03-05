# Política de Criptografia

| Campo | Valor |
|-------|-------|
| **Código** | CRP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | CISO |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Critério SOC 2** | CC6 |

---

## 1. Objetivo

Definir os padrões criptográficos obrigatórios para todas as operações de segurança do CyberShield, garantindo confidencialidade, integridade e autenticidade dos dados e comunicações.

---

## 2. Escopo

Aplica-se a:
- Comunicação agente-servidor
- Armazenamento de credenciais e tokens
- Assinatura digital de comandos e releases
- Integridade de logs e evidências
- Criptografia de dados em trânsito e em repouso

---

## 3. Algoritmos Aprovados

### 3.1 Assinaturas Digitais

| Algoritmo | Uso | Tamanho de Chave | Status |
|-----------|-----|-------------------|--------|
| **Ed25519** | Assinatura de jobs e releases de agente | 256-bit (Curve25519) | **Obrigatório** |
| **ECDSA-P256** | Assinatura de resultados pelo agente | 256-bit (secp256r1) | **Obrigatório** |

**Justificativa:** Ed25519 oferece alta performance e segurança determinística (sem necessidade de RNG durante assinatura), ideal para verificação em endpoints com recursos limitados.

### 3.2 Autenticação de Mensagens (MAC)

| Algoritmo | Uso | Tamanho de Chave | Status |
|-----------|-----|-------------------|--------|
| **HMAC-SHA256** | Autenticação de requests agente→servidor | 256-bit | **Obrigatório** |

**Formato canônico:** `timestamp:nonce:rawBody` (UTF-8)

**Requisitos:**
- Nonce único por request (anti-replay)
- Timestamp com janela de 5 minutos
- Segredo único por agente (gerado via Web Crypto API)

### 3.3 Hash Criptográfico

| Algoritmo | Uso | Status |
|-----------|-----|--------|
| **SHA-256** | Hash de tokens, integridade de scripts, hash encadeado de logs | **Obrigatório** |

**Proibido:** MD5, SHA-1 (vulneráveis a colisões)

### 3.4 Criptografia Simétrica

| Algoritmo | Uso | Tamanho de Chave | Status |
|-----------|-----|-------------------|--------|
| **AES-256-GCM** | Criptografia de dados sensíveis em repouso | 256-bit | **Obrigatório** |

**Requisitos:**
- IV de 12 bytes (96 bits) gerado via CSPRNG
- IV prefixado ao ciphertext
- Nunca reutilizar IV com a mesma chave

### 3.5 Criptografia em Trânsito

| Protocolo | Versão Mínima | Status |
|-----------|---------------|--------|
| **TLS** | 1.3 | **Obrigatório** |
| TLS 1.2 | Aceitável com cipher suites fortes | Tolerado (legado) |
| TLS 1.1 e inferior | — | **Proibido** |

---

## 4. Gestão de Chaves

### 4.1 Armazenamento

| Tipo de Chave | Armazenamento | Proteção |
|---------------|---------------|----------|
| Ed25519 Private Key (servidor) | Supabase Secrets (Vault) | Acesso restrito a Edge Functions |
| Ed25519 Public Key (agente) | Embarcada no script do agente | Verificação de integridade via hash |
| ECDSA-P256 Private Key (agente) | Windows DPAPI (per-machine) | Proteção de nível OS |
| ECDSA-P256 Public Key (servidor) | `agent_signing_keys` (banco) | RLS + tenant isolation |
| HMAC Secrets | `agents.hmac_secret` (banco) | RLS, nunca exposto em views/APIs |
| Tokens de agente | SHA-256 hash em `agent_tokens` | Nunca armazenado em texto |

### 4.2 Rotação

| Chave | Frequência de Rotação | Procedimento |
|-------|----------------------|--------------|
| Ed25519 (servidor) | Anual ou após incidente | Gerar nova keypair, assinar releases com nova chave |
| ECDSA-P256 (agente) | N+N-1 (automática) | Trigger `trg_auto_provision_signing_key` |
| HMAC Secret | Na reinstalação do agente | Rotação nuclear — revoga todos os tokens |
| API Keys | A cada 90 dias | Regeneração via dashboard |
| Stripe Keys | A cada 90 dias ou após incidente | Rotação via Stripe Dashboard |

### 4.3 Ciclo de Vida

```
Geração → Distribuição Segura → Uso Ativo → Rotação → Arquivamento → Destruição
                                     ↑                      |
                                     +──── Período N-1 ─────+
```

### 4.4 Destruição

- Chaves revogadas devem ser marcadas como `is_active = false`
- Chaves expiradas retidas por 90 dias (para verificação histórica)
- Destruição criptográfica via zero-fill após período de retenção

---

## 5. Padrões de Implementação

### 5.1 Assinatura de Jobs (Ed25519)

```
Canonical Payload = "${job_id}:${job_type}:${JSON.stringify(payload, sortedKeys)}"
Signature = Ed25519.Sign(privateKey, UTF8.Encode(canonicalPayload))
Delivery = Base64.Encode(signature)
```

**Política de falha:**
- **Jobs**: Fail-Closed — assinatura inválida = execução abortada
- **Updates**: Fail-Open condicional — assinatura inválida permitida se SHA-256 válido

### 5.2 Verificação HMAC

```
Payload = "${timestamp}:${nonce}:${rawBody}"
Expected = HMAC-SHA256(agentSecret, UTF8.Encode(payload))
Valid = ConstantTimeCompare(expected, receivedSignature)
```

### 5.3 Hash Encadeado (Audit Trail)

```
Hash[n] = SHA-256(Hash[n-1] + EventData[n])
Hash[0] = SHA-256("GENESIS")
```

---

## 6. Algoritmos Proibidos

| Algoritmo | Razão |
|-----------|-------|
| MD5 | Colisões triviais |
| SHA-1 | Colisões demonstradas (SHAttered) |
| DES / 3DES | Tamanho de bloco insuficiente |
| RSA < 2048 bits | Insuficiente para segurança moderna |
| RC4 | Vulnerabilidades sistêmicas |
| ECB mode | Sem difusão (padrões visíveis) |

---

## 7. Conformidade e Auditoria

- Todos os usos criptográficos devem ser registrados em logs de auditoria
- Revisão semestral dos algoritmos aprovados
- Avaliação de algoritmos pós-quânticos planejada para 2027

---

## 8. Evidências Técnicas

| Controle | Implementação | Localização |
|----------|--------------|-------------|
| Ed25519 Signing | `crypto-utils.ts` | `supabase/functions/_shared/` |
| HMAC Verification | `hmac.ts` | `supabase/functions/_shared/` |
| Token Hashing | `token-hash.ts` | `supabase/functions/_shared/` |
| AES-GCM | `HmacCryptoAdapter.ts` | `src/infrastructure/adapters/security/` |
| Key Management | `agent_signing_keys` table | Database |
| Hash Chain | `agent_execution_chain` table | Database |

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security Team | Versão inicial — formalização dos padrões implementados |
