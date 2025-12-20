# CyberShield Public Keys

Este diretório contém as chaves públicas usadas para verificação de assinaturas criptográficas.

## Arquivos

| Arquivo | Propósito |
|---------|-----------|
| `ecdsa_public.pem` | Chave pública ECDSA P-256 para verificar releases e documentos |

## Uso

### Verificar Assinatura de Release

```bash
# 1. Baixar release e metadados
curl -s "https://<supabase-url>/functions/v1/serve-agent-update?platform=windows" -o release.ps1

# 2. Calcular hash
sha256sum release.ps1

# 3. Verificar com chave pública (requer openssl)
echo -n "<sha256_hash>" | openssl dgst -sha256 -verify ecdsa_public.pem -signature release.sig
```

### Verificar Assinatura de Documento

```bash
# Verificar Whitepaper
sha256sum ../CYBERSHIELD_WHITEPAPER.md

# Comparar com hash no signature.json
cat ../CYBERSHIELD_WHITEPAPER.signature.json | jq '.document_hash'

# Verificar assinatura (após converter base64 para binário)
base64 -d signature.b64 > signature.bin
openssl dgst -sha256 -verify ecdsa_public.pem -signature signature.bin ../CYBERSHIELD_WHITEPAPER.md
```

## Gerar Novo Par de Chaves

⚠️ **ATENÇÃO**: Apenas super_admins podem gerar novos pares de chaves.

```bash
# Via API
curl -X POST "https://<supabase-url>/functions/v1/sign-release?action=generate-keypair" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json"
```

A chave privada retornada deve ser armazenada como secret `ECDSA_PRIVATE_KEY`.
A chave pública deve ser armazenada neste diretório como `ecdsa_public.pem`.

## Formato da Chave Pública

A chave pública está em formato Base64 (SPKI). Para converter para PEM:

```bash
echo "-----BEGIN PUBLIC KEY-----" > ecdsa_public.pem
echo "<base64_public_key>" | fold -w 64 >> ecdsa_public.pem
echo "-----END PUBLIC KEY-----" >> ecdsa_public.pem
```

## Algoritmo

- **Curva**: P-256 (prime256v1)
- **Algoritmo**: ECDSA
- **Hash**: SHA-256
- **Formato de Assinatura**: Base64

## Rotação de Chaves

Procedimento para rotação segura:

1. Gerar novo par de chaves via Edge Function
2. Armazenar nova chave privada como secret
3. Atualizar `ecdsa_public.pem` neste diretório
4. Re-assinar todas as releases ativas
5. Re-assinar documentos (Whitepaper, etc.)
6. Publicar nova chave pública
7. Comunicar mudança aos clientes

## Contato

Para questões de segurança, contate a equipe de segurança do CyberShield.
