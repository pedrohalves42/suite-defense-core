
# Plano: Validação de Assinatura Ed25519 no Update do Agente

## Estado Atual (Análise)

### ✅ Já implementado:
- **Backend**: `crypto-utils.ts` já possui `signPayload()` e `verifySignature()` com Ed25519 via Web Crypto API
- **Backend**: `register-agent-release` já auto-assina releases quando `ED25519_PRIVATE_KEY` está configurado
- **Backend**: `serve-agent-update` e `heartbeat/force-update.ts` já enviam `signature_base64` na resposta
- **DB**: Tabela `agent_releases` já possui colunas `signature_base64`, `signed_at`, `signed_by`
- **Linux/macOS v5**: Scripts autoriais (`cybershield-agent-linux-v5.sh`, `cybershield-agent-macos-v5.sh`) **já verificam** Ed25519 com `openssl pkeyutl` e rejeitam payloads sem assinatura (fail-closed desde v5.0.13)
- **Domínio DDD**: `UpdatePackage.ts` já modela `signatureBase64`, `signedAt`, `signedBy`

### ❌ Lacunas (o que precisa ser feito):
1. **Windows agent** (`agents/windows/modules/update.ps1`): `Install-AgentUpdate` recebe `$Signature` mas **nunca verifica** — apenas valida SHA-256
2. **Windows agent** (`agents/windows/modules/crypto.ps1`): Só tem `Get-PayloadHash` (SHA-256) — **sem função Ed25519**
3. **Linux/macOS modulares** (`agents/linux/modules/update.sh`, `agents/macos/modules/update.sh`): `_apply_forced_update()` **não verifica assinatura** — apenas SHA-256
4. **Heartbeat response-builder**: `hasValidSignature` está **hardcoded `false`** — nunca envia `script_sha256` assinado
5. **Payload de assinatura inconsistente**: `register-agent-release` assina `release:${platform}:${version}:${sha256}` mas os agentes Linux v5 verificam contra o hash direto

---

## Fase 1: Backend — Habilitar envio de hash assinado no heartbeat

**Arquivo**: `supabase/functions/heartbeat/response-builder.ts`
- Remover o guard `hasValidSignature = false` 
- Verificar se `signature_base64` existe na release para habilitar o envio de `script_sha256`
- Enviar `script_hash_signature` somente quando `signature_base64` estiver presente na release

---

## Fase 2: Windows Agent — Adicionar verificação Ed25519

### 2a. `agents/windows/modules/crypto.ps1` — Adicionar `Test-Ed25519Signature`
```powershell
function Test-Ed25519Signature {
    param(
        [string]$Content,
        [string]$SignatureBase64,
        [string]$PublicKeyBase64
    )
    # Usar System.Security.Cryptography.Ed25519 (.NET 5+)
    # Fallback: Se PS 5.1/.NET Framework, usar audit-only mode (log + aceitar SHA-256)
}
```

### 2b. `agents/windows/modules/update.ps1` — Integrar verificação
- Após validação de SHA-256 (passo 2), adicionar passo 2.5: Verificar assinatura Ed25519
- **Compatibilidade retroativa**: Se `$Signature` ausente E `$Global:Ed25519PublicKeyBase64` não disponível → aceitar apenas SHA-256 (warn)
- Se `$Signature` presente → verificar obrigatoriamente → rejeitar se inválida

---

## Fase 3: Linux/macOS Modulares — Adicionar verificação Ed25519

### 3a. `agents/linux/modules/update.sh` — Adicionar verificação
- Extrair `signature_base64` do JSON de resposta
- Verificar com `openssl pkeyutl -verify` usando chave pública Ed25519 embarcada
- Fail-closed: rejeitar se chave pública ou openssl não disponíveis e assinatura presente

### 3b. `agents/macos/modules/update.sh` — Mesma lógica
- Idêntico ao Linux, com fallback para `base64 -D` (macOS) 

---

## Fase 4: Normalizar payload de assinatura

**Garantir consistência**: O payload assinado deve ser o **hash SHA-256 do script normalizado** (não o formato `release:platform:version:sha256`).

Isto porque:
- Os agentes Linux v5 já verificam contra `$actual_hash` 
- É mais simples e seguro: assinar o hash que o agente já calculou localmente

**Ação**: Atualizar `register-agent-release` para assinar o SHA-256 diretamente:
```typescript
finalSignature = await signPayload(sha256, ED25519_PRIVATE_KEY);
```

---

## Fase 5: Validação e Testes

1. **Teste de assinatura válida**: Release assinada → agente aceita e executa
2. **Teste de assinatura inválida**: Assinatura adulterada → agente rejeita (Exit)
3. **Teste sem assinatura (legacy)**: Agente antigo sem Ed25519 → aceita via SHA-256 com WARN
4. **Teste de compatibilidade PS 5.1**: Fallback para audit-only mode se .NET < 5.0

---

## Critérios de Sucesso
- ✅ Agente só executa scripts assinados pela CyberShield (quando Ed25519 disponível)
- ✅ Impossível injetar script malicioso via ataque a CDN/storage
- ✅ Compatibilidade retroativa com agentes antigos mantida
- ✅ Zero erros de sintaxe em PowerShell e Bash
- ✅ Custo: $0 (Ed25519 é computado localmente, sem serviços externos)
