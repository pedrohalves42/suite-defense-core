# Runbook: Agente Linux/macOS

> **Versão:** 1.0 | **Última atualização:** 2026-04-02 | **Autor:** Equipe CyberShield  
> **Arquivos:** `agents/unix/`

---

## Índice

1. [Objetivo](#objetivo)
2. [Pré-requisitos](#pré-requisitos)
3. [Visão Geral](#visão-geral)
4. [Estrutura de Diretórios](#estrutura-de-diretórios)
5. [Serviços](#serviços)
6. [Logs](#logs)
7. [Diagnóstico](#diagnóstico)
8. [Criptografia e Autenticação](#criptografia)
9. [Atualização e Rollback](#atualização)
10. [Troubleshooting](#troubleshooting)

---

## Objetivo

Documentar a operação, diagnóstico e manutenção do **Agente CyberShield para Linux e macOS**, incluindo gerenciamento de chaves ECDSA, autenticação e serviços do sistema.

## Pré-requisitos

- **Linux:** systemd, OpenSSL 1.1+, curl, jq, bash 4+
- **macOS:** launchd, OpenSSL (via Homebrew), curl, jq, bash 4+ (via Homebrew)
- Privilégios de root/sudo
- Conectividade HTTPS (porta 443) com o backend

## Visão Geral

O agente Unix utiliza scripts Bash modulares em `agents/unix/lib/`:

- **`crypto.sh`** — Geração de keypair ECDSA P-256, assinatura de resultados
- **`network.sh`** — Comunicação segura com o backend
- **`telemetry.sh`** — Coleta de métricas do sistema
- **`main.sh`** — Orquestrador principal

### Diferença do Agente Windows

| Aspecto | Windows | Linux/macOS |
|---------|---------|-------------|
| Autenticação de resultado | HMAC-SHA256 | ECDSA P-256 + HMAC |
| Assinatura de execução | Não | Sim (`sign_execution_result`) |
| Registro de chave pública | Não | Sim (`register_agent_key`) |
| Gerenciador de serviço | Windows Service | systemd / launchd |

## Estrutura de Diretórios

```
/opt/cybershield/
├── bin/
│   ├── main.sh             # Orquestrador principal
│   └── lib/
│       ├── crypto.sh       # ECDSA + SHA-256
│       ├── network.sh      # Comunicação
│       └── telemetry.sh    # Métricas
├── config/
│   ├── agent.conf          # Configuração principal
│   └── enrollment.conf     # Dados de enrollment
├── keys/
│   ├── private.pem         # Chave privada ECDSA (chmod 600)
│   ├── public.pem          # Chave pública ECDSA
│   ├── previous.pem        # Chave anterior (backup para rotação)
│   └── fingerprint         # Fingerprint SHA-256 da chave pública
└── cache/
    └── inventory.json      # Cache local

/var/log/cybershield/
├── agent.log               # Log principal
└── update.log              # Log de atualizações
```

## Serviços

### Linux (systemd)

```bash
# Verificar status
sudo systemctl status cybershield-agent

# Iniciar
sudo systemctl start cybershield-agent

# Parar
sudo systemctl stop cybershield-agent

# Reiniciar
sudo systemctl restart cybershield-agent

# Habilitar início automático
sudo systemctl enable cybershield-agent

# Ver logs do serviço
sudo journalctl -u cybershield-agent -f --no-pager -n 50
```

### macOS (launchd)

```bash
# Verificar status
sudo launchctl list | grep cybershield

# Carregar (iniciar)
sudo launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist

# Descarregar (parar)
sudo launchctl unload /Library/LaunchDaemons/com.cybershield.agent.plist

# Ver logs
tail -f /var/log/cybershield/agent.log
```

## Logs

### Localização

| Sistema | Arquivo | Alternativa |
|---------|---------|-------------|
| Linux | `/var/log/cybershield/agent.log` | `journalctl -u cybershield-agent` |
| macOS | `/var/log/cybershield/agent.log` | `log show --predicate 'subsystem == "com.cybershield"'` |

### Níveis

Os mesmos do agente Windows: `INFO`, `WARN`, `ERROR`, `SUCCESS`.

### Exemplos de log

```
2026-04-02T10:30:00Z [INFO] [KEYS] Loaded existing keypair (fingerprint: a1b2c3d4...)
2026-04-02T10:30:01Z [SUCCESS] [KEYS] Public key registered (version: 3)
2026-04-02T10:30:05Z [INFO] [HEARTBEAT] Sent successfully (latency: 120ms)
```

### Rotação

Configurar via `logrotate` (Linux):

```
/var/log/cybershield/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
```

## Diagnóstico

### Testar conectividade

```bash
# DNS
dig sua-instancia.supabase.co

# Conectividade HTTPS
curl -sS -o /dev/null -w "HTTP %{http_code} em %{time_total}s\n" \
  https://sua-instancia.supabase.co/functions/v1/health

# Porta 443
nc -zv sua-instancia.supabase.co 443
```

### Verificar chaves ECDSA

```bash
# Verificar chave privada
openssl ec -in /opt/cybershield/keys/private.pem -check -noout 2>&1

# Ver fingerprint da chave pública
openssl dgst -sha256 -binary /opt/cybershield/keys/public.pem | xxd -p | tr -d '\n'

# Comparar com fingerprint armazenado
cat /opt/cybershield/keys/fingerprint
```

### Verificar último heartbeat

```bash
grep -i "heartbeat" /var/log/cybershield/agent.log | tail -5
```

### Testar assinatura

```bash
# Assinar dado de teste
echo -n "teste:dados:assinatura" | \
  openssl dgst -sha256 -sign /opt/cybershield/keys/private.pem | \
  base64 -w0
```

## Criptografia e Autenticação {#criptografia}

### Geração de Keypair (`crypto.sh`)

A função `generate_signing_keypair()` em `agents/unix/lib/crypto.sh`:

1. Faz backup da chave anterior em `previous.pem`
2. Gera nova chave ECDSA P-256 via `openssl ecparam`
3. Extrai chave pública via `openssl ec -pubout`
4. Calcula fingerprint SHA-256 da chave pública
5. Tenta até **3 vezes** em caso de falha
6. Define permissão `600` na chave privada

### Registro de Chave Pública

A função `register_agent_key()` envia a chave pública para o backend:

```bash
# Chave pública codificada em base64
public_key_b64=$(base64 -w0 /opt/cybershield/keys/public.pem)

# Registrar via API
curl -X POST "https://backend/functions/v1/register-agent-key" \
  -H "Content-Type: application/json" \
  -d "{\"public_key\":\"$public_key_b64\",\"key_fingerprint\":\"$fingerprint\",\"algorithm\":\"ECDSA-P256-SHA256\"}"
```

### Assinatura de Resultados de Execução

A função `sign_execution_result()` assina o resultado de cada job:

```
canonical = "agent_id:job_id:status:timestamp:result_hash"
signature = ECDSA-SHA256(canonical, private_key) | base64
```

## Atualização e Rollback {#atualização}

### Mecanismo de atualização

1. Agente verifica nova versão no heartbeat
2. Download do pacote com verificação de integridade
3. Backup dos arquivos atuais
4. Aplicação da atualização
5. Teste de sanidade (verificar que o agente inicia)
6. Rollback automático se o teste falhar

### Forçar atualização

```bash
# Via API (requer token admin)
curl -X POST "https://backend/functions/v1/force-update" \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "ID_DO_AGENTE"}'

# Verificar resultado
tail -20 /var/log/cybershield/update.log
```

### Rollback manual

```bash
# Restaurar backup
sudo cp -r /opt/cybershield/backup/* /opt/cybershield/bin/

# Reiniciar
sudo systemctl restart cybershield-agent
```

## Troubleshooting

| Sintoma | Causa Provável | Ação |
|---------|---------------|------|
| Serviço não inicia | Chave privada ausente/corrompida | `openssl ec -check` |
| Registro de chave falha | Conectividade ou firewall | Testar com `curl` |
| Assinatura rejeitada | Chave rotacionada sem registro | `register_agent_key` |
| Permissão negada | Permissões incorretas em `/opt/cybershield/keys/` | `chmod 600 private.pem` |
| Geração de chave falha 3x | OpenSSL desatualizado | Atualizar OpenSSL |
| base64 incompatível | macOS usa `base64` sem `-w0` | Verificar variante do SO |

---

**Referências:**
- `agents/unix/lib/crypto.sh` — Criptografia ECDSA
- `agents/unix/lib/network.sh` — Comunicação
- ADR-042 — Governança de Automação
