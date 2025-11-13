# 🛡️ Guia de Instalação do CyberShield Agent

## 📋 Pré-requisitos

### Windows
- ✅ Windows 10/11 ou Windows Server 2016+
- ✅ PowerShell 5.1 ou superior
- ✅ Permissões de Administrador
- ✅ Conexão com a internet

### Linux
- ✅ Ubuntu 20.04+ / Debian 10+ / CentOS 7+ / RHEL 7+
- ✅ Bash 4.0 ou superior
- ✅ Permissões de root (sudo)
- ✅ Conexão com a internet

---

## 🚀 Instalação Rápida (Recomendada)

### Windows

1. **Abra o PowerShell como Administrador**
   - Clique com botão direito no menu Iniciar
   - Selecione "Windows PowerShell (Admin)" ou "Terminal (Admin)"

2. **Execute o comando de instalação**
   ```powershell
   # Copie e cole o comando fornecido no painel de instalação
   # Exemplo:
   iex ((New-Object System.Net.WebClient).DownloadString('https://[SEU-DOMINIO]/api/install?key=XXXX'))
   ```

3. **Aguarde a instalação**
   - O script irá:
     - ✅ Baixar o agente
     - ✅ Instalar os arquivos necessários
     - ✅ Configurar o serviço do Windows
     - ✅ Iniciar o agente automaticamente

4. **Verificação**
   ```powershell
   # Verificar se o agente está rodando
   Get-Service CyberShieldAgent
   
   # Verificar logs
   Get-Content "C:\ProgramData\CyberShield\logs\agent.log" -Tail 20
   ```

### Linux

1. **Abra o Terminal**

2. **Execute o comando de instalação com sudo**
   ```bash
   # Copie e cole o comando fornecido no painel de instalação
   # Exemplo:
   curl -sSL https://[SEU-DOMINIO]/api/install?key=XXXX | sudo bash
   ```

3. **Aguarde a instalação**
   - O script irá:
     - ✅ Baixar o agente
     - ✅ Instalar dependências necessárias
     - ✅ Configurar o systemd service
     - ✅ Iniciar o agente automaticamente

4. **Verificação**
   ```bash
   # Verificar se o agente está rodando
   sudo systemctl status cybershield-agent
   
   # Verificar logs
   sudo journalctl -u cybershield-agent -f
   ```

---

## 🔧 Instalação Manual

### Windows (Instalação Manual)

1. **Download do Instalador**
   - Acesse o painel de administração
   - Clique em "Baixar Instalador Windows (.exe)"
   - Salve o arquivo `CyberShieldAgent-Setup.exe`

2. **Executar o Instalador**
   ```powershell
   # Execute como Administrador
   .\CyberShieldAgent-Setup.exe
   ```

3. **Configuração Manual**
   - Durante a instalação, forneça:
     - Enrollment Key (chave de registro)
     - Nome do agente (opcional)
   
4. **Iniciar o Serviço**
   ```powershell
   Start-Service CyberShieldAgent
   ```

### Linux (Instalação Manual)

1. **Download do Script**
   ```bash
   wget https://[SEU-DOMINIO]/scripts/install-linux.sh
   chmod +x install-linux.sh
   ```

2. **Executar com Enrollment Key**
   ```bash
   sudo ./install-linux.sh --key YOUR_ENROLLMENT_KEY
   ```

3. **Verificar Instalação**
   ```bash
   sudo systemctl start cybershield-agent
   sudo systemctl enable cybershield-agent
   ```

---

## 🩺 Diagnóstico de Problemas

### Problema: Agente não conecta

#### Windows
```powershell
# Verificar se o serviço está rodando
Get-Service CyberShieldAgent

# Verificar logs de erro
Get-Content "C:\ProgramData\CyberShield\logs\agent.log" | Select-String "ERROR"

# Testar conectividade
Test-NetConnection -ComputerName [DOMINIO-SUPABASE].supabase.co -Port 443

# Verificar firewall
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*CyberShield*"}
```

#### Linux
```bash
# Verificar status do serviço
sudo systemctl status cybershield-agent

# Verificar logs
sudo journalctl -u cybershield-agent -n 100

# Testar conectividade
curl -v https://[DOMINIO-SUPABASE].supabase.co

# Verificar DNS
nslookup [DOMINIO-SUPABASE].supabase.co
```

### Problema: Erro de Autenticação

1. **Verificar Enrollment Key**
   - Certifique-se de que a chave não expirou
   - Verifique se copiou a chave completa
   - Gere uma nova chave se necessário

2. **Verificar Configuração**
   ```powershell
   # Windows
   Get-Content "C:\ProgramData\CyberShield\config.json"
   ```
   ```bash
   # Linux
   sudo cat /etc/cybershield/config.json
   ```

### Problema: Firewall Corporativo

Se sua empresa usa firewall ou proxy:

1. **Liberar domínios necessários:**
   - `*.supabase.co` (porta 443)
   - `*.supabase.io` (porta 443)

2. **Configurar Proxy (se necessário):**
   ```powershell
   # Windows
   [System.Net.WebRequest]::DefaultWebProxy = New-Object System.Net.WebProxy('http://proxy:8080')
   ```
   ```bash
   # Linux
   export https_proxy=http://proxy:8080
   ```

---

## ✅ Checklist Pós-Instalação

- [ ] Serviço do agente está rodando
- [ ] Agente aparece no dashboard como "Online"
- [ ] Último heartbeat foi recebido (< 5 minutos)
- [ ] Métricas do sistema estão sendo coletadas
- [ ] Logs não mostram erros críticos

---

## 📞 Suporte

### Autodiagnóstico
Use a página de Diagnóstico de Agentes no painel administrativo para:
- ✅ Verificar status de conectividade
- ✅ Executar health checks
- ✅ Ver logs detalhados
- ✅ Identificar problemas de rede

### Contato
- 📧 Email: suporte@cybershield.com
- 💬 WhatsApp: +55 34 98443-2835
- 🌐 Portal: https://[SEU-DOMINIO]/admin/diagnostics

---

## 🔄 Desinstalação

### Windows
```powershell
# Parar o serviço
Stop-Service CyberShieldAgent

# Remover via Painel de Controle ou:
msiexec /x {PRODUCT-CODE} /qn
```

### Linux
```bash
sudo systemctl stop cybershield-agent
sudo systemctl disable cybershield-agent
sudo rm -rf /opt/cybershield
sudo rm /etc/systemd/system/cybershield-agent.service
sudo systemctl daemon-reload
```

---

## 📝 Notas Importantes

1. **Segurança**: Nunca compartilhe suas Enrollment Keys publicamente
2. **Firewall**: Certifique-se de que a porta 443 (HTTPS) está aberta
3. **Atualizações**: O agente se auto-atualiza automaticamente
4. **Logs**: Os logs são mantidos por 30 dias e então removidos automaticamente

---

**Versão do Documento**: 1.0.0  
**Última Atualização**: 2025-11-13
