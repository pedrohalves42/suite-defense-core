# Runbook: Rotação de Chaves

| Campo | Valor |
|-------|-------|
| **Código** | RB-KEYROT-001 |
| **Versão** | 1.0 |

---

## 1. Rotação de Chave Ed25519 do Servidor

**Frequência:** Anual ou após incidente

```
1. Gerar novo par de chaves Ed25519
2. Adicionar nova chave privada como secret (ED25519_PRIVATE_KEY_V2)
3. Atualizar Edge Functions para usar nova chave
4. Assinar próximas releases com nova chave
5. Embarcar nova chave pública nas releases
6. Após 100% da frota atualizada: remover chave antiga
7. Registrar rotação em audit_logs
```

## 2. Rotação de HMAC Secret (por agente)

**Frequência:** Na reinstalação ou comprometimento

```
1. Executar rotação nuclear (revoga todos os tokens)
2. Novo HMAC secret gerado automaticamente
3. Novo token emitido
4. Agente reconecta com novas credenciais
5. Verificar heartbeat com novo token
```

## 3. Rotação de Chave de API Stripe

**Frequência:** Trimestral

```
1. Gerar nova chave no Stripe Dashboard
2. Atualizar secret STRIPE_SECRET_KEY no Vault
3. Atualizar STRIPE_WEBHOOK_SECRET se necessário
4. Testar checkout e webhook
5. Revogar chave antiga no Stripe
```

## 4. Rotação de Secret Interno

**Frequência:** Trimestral

```
1. Gerar novo secret (64 caracteres hex)
2. Atualizar INTERNAL_SECRET no Vault
3. Todas as Edge Functions usam o novo valor automaticamente
4. Testar comunicação inter-function
```

## 5. Rotação de Chave ECDSA do Agente

**Frequência:** Automática (N+N-1)

```
Automático via trigger trg_auto_provision_signing_key:
1. Nova chave provisionada ao agente
2. Chave anterior mantida (N-1) para verificação
3. Chave N-2 desativada (is_active=false)
4. valid_until define expiração
```

---

## Checklist Pós-Rotação

- [ ] Serviço operacional (sem erros 401/403)
- [ ] Agentes reconectando normalmente
- [ ] Chave antiga revogada/removida
- [ ] Rotação registrada em audit_logs
- [ ] Documentação atualizada

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Security | Versão inicial |
