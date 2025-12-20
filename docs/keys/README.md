# CyberShield Public Keys

Este diretório contém as chaves públicas usadas para verificação de assinaturas criptográficas.

## Arquivos

| Arquivo | Propósito |
|---------|-----------|
| `ecdsa_public.pem` | Chave pública ECDSA P-256 para verificar releases e documentos |

## Fingerprint da Chave Pública

```
SHA-256 Fingerprint: PENDING_KEY_GENERATION
```

> ⚠️ **Sempre verifique o fingerprint** antes de confiar na chave pública.
> Compare com o valor publicado em canais oficiais (website, email assinado, etc.)

---

## Verificação Externa (Zero Trust)

### Passo 1: Obter Metadados de Assinatura

```bash
# Endpoint público - não requer autenticação
curl -s "https://<supabase-url>/functions/v1/verify-document?name=CYBERSHIELD_WHITEPAPER.md" | jq
```

Resposta esperada:
```json
{
  "found": true,
  "document_name": "CYBERSHIELD_WHITEPAPER.md",
  "document_hash": "a3f91c8c...",
  "signature_base64": "MEUCIQD...",
  "algorithm": "ECDSA-P256-SHA256",
  "signed_at": "2025-01-15T...",
  "verification_note": "This endpoint returns signature data. Verification must be performed by the caller..."
}
```

### Passo 2: Calcular Hash do Documento Local

```bash
# Linux/macOS
sha256sum docs/CYBERSHIELD_WHITEPAPER.md

# Windows (PowerShell)
Get-FileHash -Algorithm SHA256 docs/CYBERSHIELD_WHITEPAPER.md
```

### Passo 3: Comparar Hashes

```bash
# Hash retornado pela API deve ser IDÊNTICO ao hash local
# Se diferente: documento foi modificado ou corrompido
```

### Passo 4: Verificar Assinatura (Opcional - Requer OpenSSL)

```bash
# 1. Salvar assinatura em arquivo binário
echo "<signature_base64>" | base64 -d > signature.bin

# 2. Criar arquivo com o hash (raw bytes)
echo -n "<document_hash>" | xxd -r -p > hash.bin

# 3. Verificar com chave pública
openssl dgst -sha256 -verify docs/keys/ecdsa_public.pem -signature signature.bin hash.bin

# Resultado esperado: "Verified OK"
```

---

## Verificação de Agent Releases

### Obter Release e Metadados

```bash
# 1. Baixar release
curl -s "https://<supabase-url>/functions/v1/serve-agent-update?platform=windows" -o release.ps1

# 2. Calcular hash do arquivo baixado
sha256sum release.ps1

# 3. Obter metadados (incluindo assinatura)
curl -s "https://<supabase-url>/functions/v1/serve-agent-update?platform=windows&metadata=true" | jq
```

### Verificar Integridade

```bash
# Comparar sha256 retornado na API com hash local
# Se match: arquivo não foi alterado em trânsito
```

---

## Gerar Novo Par de Chaves

⚠️ **ATENÇÃO**: Apenas `super_admin` pode gerar novos pares de chaves.

```bash
# Via Edge Function (requer JWT de super_admin)
curl -X POST "https://<supabase-url>/functions/v1/sign-release?action=generate-keypair" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json"
```

Resposta:
```json
{
  "success": true,
  "public_key": "MFkwEwYHKoZIzj0CAQY...",
  "private_key": "MIGHAgEAMBMGByqGSM49..."
}
```

**Após gerar:**
1. Armazenar `private_key` como secret `ECDSA_PRIVATE_KEY`
2. Converter `public_key` para PEM e salvar neste diretório
3. Calcular e publicar o fingerprint SHA-256

---

## Formato da Chave Pública

A chave pública é retornada em Base64 (SPKI). Para converter para PEM:

```bash
echo "-----BEGIN PUBLIC KEY-----" > ecdsa_public.pem
echo "<base64_public_key>" | fold -w 64 >> ecdsa_public.pem
echo "-----END PUBLIC KEY-----" >> ecdsa_public.pem

# Calcular fingerprint
openssl pkey -in ecdsa_public.pem -pubin -outform DER | sha256sum
```

---

## Especificações Criptográficas

| Parâmetro | Valor |
|-----------|-------|
| Algoritmo | ECDSA |
| Curva | P-256 (prime256v1 / secp256r1) |
| Hash | SHA-256 |
| Formato de Assinatura | Base64 (DER-encoded) |
| Tamanho da Chave | 256 bits |

---

## Rotação de Chaves

Procedimento para rotação segura:

1. ✅ Gerar novo par de chaves via Edge Function
2. ✅ Armazenar nova chave privada como secret
3. ✅ Atualizar `ecdsa_public.pem` neste diretório
4. ✅ Calcular e publicar novo fingerprint
5. ✅ Re-assinar todas as releases ativas
6. ✅ Re-assinar documentos (Whitepaper, etc.)
7. ✅ Publicar nova chave pública em canais oficiais
8. ✅ Comunicar mudança aos clientes com antecedência

---

## Contato

Para questões de segurança, contate a equipe de segurança do CyberShield.
