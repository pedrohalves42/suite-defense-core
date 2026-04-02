# Política 21 — Princípio de Kerckhoffs

> **Identificador:** POL-021  
> **Versão:** 1.0  
> **Data de vigência:** 2026-04-02  
> **Classificação:** Governança de Segurança  
> **Responsável:** CISO / Equipe de Arquitetura  
> **Revisão:** Anual ou após incidente de segurança

---

## 1. Objetivo

Formalizar a adoção do **Princípio de Kerckhoffs** como diretriz fundamental de segurança do CyberShield, estabelecendo que a segurança do sistema deve depender exclusivamente da confidencialidade das **chaves criptográficas**, e nunca do sigilo do código-fonte, algoritmos ou arquitetura.

> *"Se o sistema deixa de ser seguro só porque alguém viu o código, ele nunca foi seguro."*

## 2. Escopo

Esta política aplica-se a todos os componentes do CyberShield:

- Backend (Edge Functions, banco de dados)
- Frontend (Dashboard React)
- Agentes (Windows, Linux, macOS)
- Processos de CI/CD e automação

## 3. Declaração da Política

### 3.1 Princípio Fundamental

A segurança do CyberShield **NÃO** depende de:
- Sigilo do código-fonte
- Obscuridade de algoritmos
- Desconhecimento da arquitetura por potenciais atacantes

A segurança do CyberShield **DEPENDE** exclusivamente de:
- Confidencialidade das chaves criptográficas
- Integridade dos mecanismos de autenticação
- Corretude das políticas de controle de acesso

### 3.2 Implicações

| Prática Proibida | Prática Obrigatória |
|-------------------|---------------------|
| Security through obscurity | Criptografia comprovada (HMAC-SHA256, ECDSA P-256, AES-GCM) |
| Hardcoded secrets no código | Gerenciamento de segredos via vault/environment |
| Algoritmos proprietários de autenticação | Padrões abertos e auditáveis |
| Comparação direta de strings sensíveis | `timingSafeEqual` para todas as comparações |

## 4. Evidências Técnicas de Conformidade

### 4.1 Autenticação de Agentes — HMAC-SHA256

**Arquivo:** `src/infrastructure/adapters/security/HmacCryptoAdapter.ts`

O sistema utiliza HMAC-SHA256 via Web Crypto API:

```typescript
// Geração de segredo HMAC (256 bits, criptograficamente seguro)
async generateHmacSecret(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    true, ['sign', 'verify']
  );
  // Exportado como hex, nunca em texto plano
}

// Verificação com resistência a timing attacks
async verifyHmac(message, secret, signature): Promise<boolean> {
  return crypto.subtle.verify('HMAC', key, signatureBuffer, data);
  // crypto.subtle.verify é timing-safe por design
}
```

**Análise:** Mesmo que um atacante conheça o algoritmo (HMAC-SHA256) e a implementação, sem o segredo HMAC do agente (armazenado com permissões restritas), não pode forjar requisições.

### 4.2 Assinatura de Execução — ECDSA P-256

**Arquivo:** `agents/unix/lib/crypto.sh`

```bash
# Geração de keypair ECDSA P-256
openssl ecparam -genkey -name prime256v1 -noout -out "$PRIVATE_KEY_PATH"
chmod 600 "$PRIVATE_KEY_PATH"  # Acesso restrito

# Assinatura de resultados
sign_execution_result() {
    local canonical="${1}:${2}:${3}:${4}:${5}"
    echo -n "$canonical" | openssl dgst -sha256 -sign "$PRIVATE_KEY_PATH" | base64
}
```

**Análise:** O algoritmo (ECDSA P-256) e o formato canônico são públicos. A segurança reside na chave privada, protegida com `chmod 600`.

### 4.3 Hashing — SHA-256

**Arquivo:** `agents/windows/modules/crypto.ps1`

```powershell
function Get-PayloadHash {
    param([string]$Payload)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hash = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Payload))
    return ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
}
```

**Análise:** SHA-256 é um padrão público. Conhecer a implementação não compromete a integridade dos hashes.

### 4.4 Criptografia em Repouso — AES-256-GCM

**Arquivo:** `src/infrastructure/adapters/security/HmacCryptoAdapter.ts`

```typescript
async encrypt(data: string, key: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // IV aleatório
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, cryptoKey, encoded
    );
    // IV prefixado ao ciphertext (padrão público)
}
```

**Análise:** AES-GCM é padrão NIST. IV é público. Segurança depende da chave de 256 bits.

### 4.5 Isolamento de Dados — RLS

**Implementação:** PostgreSQL Row-Level Security em 80+ tabelas

```sql
-- Todas as políticas usam get_active_tenant_id()
-- Conhecer a função não permite bypass sem JWT válido
CREATE POLICY "tenant_isolation" ON agents
  USING (tenant_id = get_active_tenant_id());
```

**Análise:** As políticas RLS são declarativas e auditáveis. Segurança depende do JWT válido, não do desconhecimento das regras.

### 4.6 Proteção Anti-replay — Nonce

Cada requisição HMAC inclui um nonce (número usado uma vez) com tolerância de ±5 minutos para clock skew. O mecanismo é público; a proteção vem da unicidade do nonce e do segredo HMAC.

### 4.7 Circuit Breaker — Fail-closed

**Arquivo:** `src/lib/circuit-breaker.ts`

O circuit breaker global opera em modo **fail-closed**: se a verificação falhar, a ação é bloqueada. Conhecer o threshold (30% da frota em 10 min) não permite bypass.

## 5. Proteção de Chaves

### 5.1 Onde os segredos residem

| Segredo | Localização | Proteção |
|---------|-------------|----------|
| HMAC secret do agente | `agents` table (DB) + arquivo local | RLS + ACL do SO |
| Chave privada ECDSA | `/opt/cybershield/keys/private.pem` | `chmod 600` |
| Token do agente Windows | `C:\ProgramData\CyberShield\keys\` | ACL SYSTEM only |
| JWT secrets | Variáveis de ambiente do backend | Vault/secrets manager |
| Chave de criptografia AES | Derivada do segredo do tenant | Nunca em texto plano |

### 5.2 Controles obrigatórios

1. **Nunca hardcodar** segredos no código-fonte
2. **Rotação periódica** de chaves (conforme Política 11 — Criptografia)
3. **Auditoria** de acesso a segredos via `audit_logs`
4. **Revogação imediata** em caso de comprometimento
5. **Backup seguro** com criptografia em repouso

## 6. Validação e Auditoria

### 6.1 Testes automatizados

- `src/lib/__tests__/circuit-breaker.test.ts` — 7 cenários de resiliência
- `src/domain/services/__tests__/CryptoService.test.ts` — 4 cenários de criptografia
- `tools/tests/assert_sensitive_tables_no_public_access.sql` — Validação de acesso a tabelas sensíveis

### 6.2 Verificações de CI

```sql
-- Verifica que tabelas sensíveis não têm acesso anônimo
-- tools/tests/assert_sensitive_tables_no_public_access.sql
SELECT array_agg(tablename) FROM pg_tables
WHERE tablename IN ('agents', 'agent_tokens', 'enrollment_keys', 'api_keys')
  AND EXISTS (SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND privilege_type = 'SELECT');
-- Resultado esperado: NULL (nenhuma tabela vulnerável)
```

### 6.3 Critérios SOC 2

| Controle SOC 2 | Evidência |
|----------------|-----------|
| CC6.1 (Access Control) | RLS em 80+ tabelas, `get_active_tenant_id()` |
| CC7.2 (Audit Trail) | `agent_evidence_logs` com hash de integridade |
| CC6.6 (Encryption) | HMAC-SHA256, ECDSA P-256, AES-256-GCM |

## 7. Exceções

Não há exceções a esta política. Qualquer componente que dependa de sigilo do código para segurança é considerado uma **vulnerabilidade** e deve ser corrigido imediatamente.

## 8. Referências

- Auguste Kerckhoffs, "La cryptographie militaire" (1883)
- NIST SP 800-175B — Guide to Secure Web Services
- Política 11 — Criptografia
- ADR-023 — Hardening de RLS
- ADR-042 — Governança de Automação
- `src/domain/ports/CryptoPort.ts` — Interface de operações criptográficas
- `src/infrastructure/adapters/security/HmacCryptoAdapter.ts` — Implementação Web Crypto

---

**Aprovação:**

| Papel | Nome | Data |
|-------|------|------|
| CISO | ________________ | ____/____/________ |
| Arquiteto de Segurança | ________________ | ____/____/________ |
| Líder de Desenvolvimento | ________________ | ____/____/________ |
