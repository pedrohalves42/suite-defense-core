# CyberShield Agent

Agente autônomo Python que se comunica com o servidor CyberShield via requisições HMAC-signed.

## 🚀 Funcionalidades

- ✅ **Heartbeat automático**: Envia status a cada 60 segundos
- ✅ **Polling de jobs**: Busca jobs pendentes a cada 30 segundos
- ✅ **Autenticação HMAC-SHA256**: Todas requisições assinadas
- ✅ **Retry com exponential backoff**: Resiliente a falhas temporárias
- ✅ **Logs estruturados**: Rotação automática de logs
- ✅ **Graceful shutdown**: Para threads corretamente
- ✅ **Informações do SO**: Coleta hostname, OS type e version

## 📋 Requisitos

- Python 3.8+
- Bibliotecas: `requests`

## 🔧 Instalação

### 1. Instalar dependências

```bash
pip install -r requirements.txt
```

### 2. Configurar agente

Crie arquivo `agent_config.json`:

```json
{
  "agent_name": "my-server-01",
  "agent_token": "token_gerado_pelo_servidor",
  "hmac_secret": "64_caracteres_hex_do_hmac_secret",
  "server_url": "https://your-project.supabase.co",
  "heartbeat_interval": 60,
  "poll_interval": 30
}
```

**Importante**: Obtenha os valores corretos de `agent_token` e `hmac_secret` do servidor.

### 3. Executar agente

```bash
python main.py
```

Ou com log detalhado:

```bash
python main.py --log-level DEBUG
```

## 🏗️ Build do Executável

Para gerar executável standalone:

```bash
python build.py
```

O executável será gerado em `dist/cybershield-agent.exe` (Windows) ou `dist/cybershield-agent` (Linux/Mac).

### Executar o executável:

```bash
# Windows
.\dist\cybershield-agent.exe --config agent_config.json

# Linux/Mac
./dist/cybershield-agent --config agent_config.json
```

## 📂 Estrutura do Projeto

```
agent/
├── main.py                 # Entry point principal
├── config.py               # Gerenciamento de configuração
├── hmac_utils.py           # Utilitários HMAC-SHA256
├── heartbeat_sender.py     # Componente de heartbeat
├── job_poller.py           # Componente de polling
├── logger_config.py        # Configuração de logs
├── requirements.txt        # Dependências Python
├── build.py                # Script de build
├── agent_config.json       # Configuração (não commitar!)
└── logs/                   # Diretório de logs
    └── agent.log
```

## 🔒 Segurança

- **HMAC-SHA256**: Todas requisições assinadas para prevenir replay attacks
- **Nonce único**: Cada requisição usa UUID v4 único
- **Timestamp validation**: Servidor valida timestamps (janela de 5 minutos)
- **Rate limiting**: Proteção contra flooding no servidor

## 🐛 Troubleshooting

### Erro: "Autenticação falhou"

- Verifique se `agent_token` está correto
- Verifique se `hmac_secret` tem 64 caracteres
- Confira se `server_url` está correto

### Erro: "Rate limit excedido"

- Ajuste `heartbeat_interval` e `poll_interval` no config
- Aguarde alguns minutos antes de reiniciar

### Logs não aparecem

- Verifique permissões de escrita no diretório `logs/`
- Use `--log-level DEBUG` para mais detalhes

## 📊 Monitoramento

Logs são salvos em `logs/agent.log` com rotação automática (10MB, 5 backups).

Formato de log:
```
2025-11-13 12:30:45 | INFO     | heartbeat_sender | ✅ Heartbeat enviado com sucesso
2025-11-13 12:31:15 | INFO     | job_poller       | 📥 Recebidos 2 job(s)
2025-11-13 12:31:16 | INFO     | job_poller       | 🔧 Executando job abc-123 (scan)
```

## 📝 Licença

Proprietary - CyberShield
