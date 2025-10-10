# 🚀 CyberShield - Início Rápido

**Domínio:** https://suite-defense-core.lovable.app

## 📝 Passo a Passo Resumido

### 1️⃣ Acesse o Dashboard Principal

Abra seu navegador e acesse:
```
https://suite-defense-core.lovable.app
```

Você verá o **Dashboard do Servidor** com:
- Total de agentes conectados
- Status de agentes ativos
- Jobs pendentes e concluídos
- Relatórios de segurança

### 2️⃣ Crie um Instalador para seus Agentes

1. No dashboard, clique em **"Criar Instalador"**
2. Escolha o tipo:
   - **Servidor Central**: Se quiser instalar um servidor local
   - **Agente de Segurança**: Para instalar em máquinas que serão monitoradas
3. Selecione a plataforma (Windows ou Linux)
4. Configure:
   - **Nome do Agente**: Ex: `AGENT-WORKSTATION-01`
   - **Tenant ID**: Ex: `production` (agrupa agentes por ambiente)
5. Clique em **"Gerar Token"** (apenas para agentes)
6. Baixe o script de instalação

### 3️⃣ Execute o Instalador no Computador Alvo

#### Windows
1. Abra PowerShell **como Administrador**
2. Execute:
   ```powershell
   powershell -ExecutionPolicy Bypass -File cybershield-agent-[nome].ps1
   ```

#### Linux
1. Abra o terminal **como root**
2. Execute:
   ```bash
   chmod +x cybershield-agent-[nome].sh
   sudo ./cybershield-agent-[nome].sh
   ```

### 4️⃣ Verifique a Conexão

Volte ao dashboard em:
```
https://suite-defense-core.lovable.app
```

Na aba **"Agentes"**, você verá:
- ✅ Seu agente listado com um **indicador verde** (ativo)
- Nome do agente
- Último heartbeat
- Número de jobs executados
- Relatórios gerados

### 5️⃣ Execute Operações de Segurança

No dashboard, você pode criar jobs para seus agentes executarem:

- **Verificações Locais**: Firewall, Windows Update, SMBv1, RDP NLA
- **Scan Nmap**: Descoberta de rede e serviços
- **Remediação Automática**: Corrige problemas de segurança

Os resultados aparecerão na aba **"Relatórios"**.

## 🎯 Principais Funcionalidades

### Dashboard Unificado
- **Visão Geral**: Métricas em tempo real de todos os agentes
- **Por Tenant**: Agrupe agentes por ambiente (dev, staging, production)
- **Alertas**: Notificações quando agentes ficam offline
- **Taxa de Sucesso**: Acompanhe a eficácia das operações

### Agentes
- **Heartbeat Automático**: Verifica conexão a cada 60 segundos
- **Varredura Antivírus**: Windows Defender (Windows) ou ClamAV (Linux)
- **Monitoramento**: Firewall, processos, rede
- **Logs Detalhados**: Todas as ações são registradas

### Jobs
- **Criação Remota**: Envie comandos para agentes específicos
- **Status em Tempo Real**: Veja o progresso dos jobs
- **Histórico Completo**: Acesse todos os jobs executados

### Relatórios
- **Resultados de Scans**: Veja vulnerabilidades encontradas
- **Análises de Segurança**: Relatórios detalhados por agente
- **Download**: Exporte relatórios para análise offline

## 🔗 Links Importantes

- **Dashboard Principal**: https://suite-defense-core.lovable.app
- **Criar Instalador**: https://suite-defense-core.lovable.app/installer
- **Documentação Completa**: Ver arquivo `INSTALLATION_GUIDE.md`

## 💡 Dicas

1. **Organize por Tenant**: Use IDs diferentes para ambientes (dev, staging, prod)
2. **Nomes Descritivos**: Nomeie agentes claramente (ex: `AGENT-HR-PC01`, `AGENT-SERVER-DB`)
3. **Monitore Regularmente**: Verifique o dashboard diariamente
4. **Responda a Alertas**: Agentes offline podem indicar problemas
5. **Revise Relatórios**: Analise resultados de scans semanalmente

## 🆘 Suporte Rápido

### Agente não aparece no dashboard?

1. Verifique se o serviço está rodando:
   - Windows: `Get-Service CyberShieldAgent`
   - Linux: `sudo systemctl status cybershield-agent`

2. Verifique logs:
   - Windows: `C:\Program Files\CyberShield\Agent\logs\`
   - Linux: `sudo journalctl -u cybershield-agent -n 50`

### Jobs não executam?

1. Verifique se o agente está ativo (indicador verde no dashboard)
2. Confirme que o job foi criado para o agente correto
3. Verifique logs do agente

### Precisa reinstalar?

Execute o mesmo script de instalação novamente. Ele sobrescreverá a instalação anterior.

---

**Versão:** 1.0.0  
**Domínio:** suite-defense-core.lovable.app
