# 🚀 Guia de Deploy do CyberShield Agent

Este guia detalha o processo completo de deployment do agente CyberShield em ambientes de produção.

## 📋 Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Build do Executável](#build-do-executável)
3. [Instalação no Servidor](#instalação-no-servidor)
4. [Configuração](#configuração)
5. [Execução como Serviço](#execução-como-serviço)
6. [Monitoramento](#monitoramento)
7. [Troubleshooting](#troubleshooting)

---

## 🔧 Pré-requisitos

### Ambiente de Build

- **Python 3.8+**
- **pip** (gerenciador de pacotes Python)
- **PyInstaller** (instalado via requirements.txt)
- **Git** (para clonar repositório)

### Servidor de Destino

- **Windows Server 2016+** ou **Linux (Ubuntu 20.04+, CentOS 7+)**
- **2 GB RAM** mínimo
- **100 MB de espaço em disco**
- **Conectividade HTTPS** para o servidor CyberShield

---

## 📦 Build do Executável

### 1. Clonar repositório

```bash
git clone https://github.com/seu-org/cybershield.git
cd cybershield/agent
```

### 2. Instalar dependências

```bash
pip install -r requirements.txt
```

### 3. Executar build

```bash
python build.py
```

**Saída esperada:**
```
🔨 Iniciando build do CyberShield Agent...
🧹 Limpando builds anteriores...
📦 Executando: python -m PyInstaller --onefile ...
✅ Build concluído com sucesso!
📍 Executável: dist/cybershield-agent.exe
📊 Tamanho: 12.45 MB
```

### 4. Validar executável

```bash
# Windows
dist\cybershield-agent.exe --version

# Linux
./dist/cybershield-agent --version
```

Deve retornar:
```
CyberShield Agent v1.0.0
```

---

## 🖥️ Instalação no Servidor

### Windows

#### 1. Copiar executável

```powershell
# Criar diretório de instalação
New-Item -Path "C:\CyberShield\Agent" -ItemType Directory -Force

# Copiar executável
Copy-Item "dist\cybershield-agent.exe" -Destination "C:\CyberShield\Agent\"
```

#### 2. Criar arquivo de configuração

```powershell
@"
{
  "agent_name": "server-prod-01",
  "agent_token": "SEU_TOKEN_AQUI",
  "hmac_secret": "SEU_HMAC_SECRET_64_CHARS_AQUI",
  "server_url": "https://your-project.supabase.co",
  "heartbeat_interval": 60,
  "poll_interval": 30
}
"@ | Out-File -FilePath "C:\CyberShield\Agent\agent_config.json" -Encoding UTF8
```

### Linux

#### 1. Copiar executável

```bash
# Criar diretório
sudo mkdir -p /opt/cybershield/agent

# Copiar executável
sudo cp dist/cybershield-agent /opt/cybershield/agent/

# Tornar executável
sudo chmod +x /opt/cybershield/agent/cybershield-agent
```

#### 2. Criar arquivo de configuração

```bash
sudo cat > /opt/cybershield/agent/agent_config.json <<EOF
{
  "agent_name": "server-prod-01",
  "agent_token": "SEU_TOKEN_AQUI",
  "hmac_secret": "SEU_HMAC_SECRET_64_CHARS_AQUI",
  "server_url": "https://your-project.supabase.co",
  "heartbeat_interval": 60,
  "poll_interval": 30
}
EOF
```

---

## ⚙️ Configuração

### Obter Credenciais

As credenciais (`agent_token` e `hmac_secret`) são geradas pelo servidor CyberShield durante o enrollment:

1. Acesse o painel administrativo: `https://your-app.com/admin/agents`
2. Clique em **"Generate Installer"**
3. Informe o nome do agente (ex: `server-prod-01`)
4. O sistema irá gerar:
   - **Agent Token**: Token de autenticação
   - **HMAC Secret**: Secret de 64 caracteres para assinatura

### Validar Configuração

```bash
# Testar se configuração está válida
cybershield-agent --config agent_config.json --version
```

---

## 🔄 Execução como Serviço

### Windows Service

#### 1. Instalar NSSM (Non-Sucking Service Manager)

```powershell
# Download NSSM
Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "nssm.zip"
Expand-Archive -Path "nssm.zip" -DestinationPath "."
Move-Item "nssm-2.24\win64\nssm.exe" -Destination "C:\Windows\System32\"
```

#### 2. Criar serviço

```powershell
nssm install CyberShieldAgent "C:\CyberShield\Agent\cybershield-agent.exe"
nssm set CyberShieldAgent AppDirectory "C:\CyberShield\Agent"
nssm set CyberShieldAgent AppParameters "--config agent_config.json"
nssm set CyberShieldAgent DisplayName "CyberShield Agent"
nssm set CyberShieldAgent Description "Agente de segurança CyberShield"
nssm set CyberShieldAgent Start SERVICE_AUTO_START
nssm set CyberShieldAgent ObjectName LocalSystem
nssm set CyberShieldAgent Type SERVICE_WIN32_OWN_PROCESS
```

#### 3. Iniciar serviço

```powershell
Start-Service CyberShieldAgent
Get-Service CyberShieldAgent
```

### Linux Systemd

#### 1. Criar arquivo de serviço

```bash
sudo cat > /etc/systemd/system/cybershield-agent.service <<EOF
[Unit]
Description=CyberShield Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cybershield/agent
ExecStart=/opt/cybershield/agent/cybershield-agent --config /opt/cybershield/agent/agent_config.json
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

#### 2. Habilitar e iniciar

```bash
sudo systemctl daemon-reload
sudo systemctl enable cybershield-agent
sudo systemctl start cybershield-agent
sudo systemctl status cybershield-agent
```

---

## 📊 Monitoramento

### Logs

#### Windows

```powershell
# Visualizar logs em tempo real
Get-Content -Path "C:\CyberShield\Agent\logs\agent.log" -Wait -Tail 50
```

#### Linux

```bash
# Visualizar logs do systemd
sudo journalctl -u cybershield-agent -f

# Visualizar logs do arquivo
tail -f /opt/cybershield/agent/logs/agent.log
```

### Health Check

Verificar se agente está enviando heartbeats:

1. Acesse: `https://your-app.com/admin/agents`
2. Localize seu agente
3. Verifique campo **"Last Heartbeat"**
   - ✅ Verde: < 2 minutos
   - ⚠️ Amarelo: 2-5 minutos
   - ❌ Vermelho: > 5 minutos

---

## 🐛 Troubleshooting

### Erro: "Autenticação falhou"

**Causa**: `agent_token` ou `hmac_secret` incorretos

**Solução**:
1. Verifique se copiou credenciais corretamente
2. Confirme que `hmac_secret` tem exatamente 64 caracteres
3. Regenere credenciais no painel admin se necessário

### Erro: "Erro de conexão ao servidor"

**Causa**: Servidor inacessível ou firewall bloqueando

**Solução**:
1. Teste conectividade: `curl https://your-server.supabase.co/functions/v1/heartbeat`
2. Verifique regras de firewall
3. Confirme que porta 443 (HTTPS) está aberta

### Erro: "Rate limit excedido"

**Causa**: Intervalos de heartbeat/poll muito agressivos

**Solução**:
```json
{
  "heartbeat_interval": 120,  // Aumentar para 2 minutos
  "poll_interval": 60          // Aumentar para 1 minuto
}
```

### Agente não inicia

**Windows**:
```powershell
# Verificar logs do Event Viewer
Get-EventLog -LogName Application -Source "CyberShieldAgent" -Newest 50
```

**Linux**:
```bash
# Verificar logs do systemd
sudo journalctl -u cybershield-agent -n 100
```

---

## 🔒 Segurança

### Proteção de Credenciais

```bash
# Linux: Restringir permissões do arquivo de config
sudo chmod 600 /opt/cybershield/agent/agent_config.json
sudo chown root:root /opt/cybershield/agent/agent_config.json
```

```powershell
# Windows: Remover herança e conceder acesso apenas ao SYSTEM
icacls "C:\CyberShield\Agent\agent_config.json" /inheritance:r
icacls "C:\CyberShield\Agent\agent_config.json" /grant:r "SYSTEM:(F)"
```

---

## 📚 Referências

- [Documentação completa do agente](../agent/README.md)
- [Especificação HMAC](./HMAC_SPECIFICATION.md)
- [Troubleshooting avançado](../TROUBLESHOOTING_GUIDE.md)

---

## 🆘 Suporte

- **Email**: support@cybershield.com
- **Slack**: #cybershield-support
- **Documentação**: https://docs.cybershield.com
