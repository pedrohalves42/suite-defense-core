# 🛡️ Guia de Início Rápido - CyberShield

> Bem-vindo ao CyberShield! Este guia vai ajudá-lo a configurar a proteção dos seus computadores em menos de 15 minutos.

---

## 🎯 O que você terá ao final deste guia

- ✅ Seu primeiro computador monitorado
- ✅ Métricas de segurança coletadas automaticamente
- ✅ Dashboard funcional com dados em tempo real
- ✅ Inventário de software instalado
- ✅ Status do antivírus verificado

---

## 📋 O que você vai precisar

| Requisito | Detalhes |
|-----------|----------|
| 💻 **Computador** | Windows 10/11 ou Windows Server 2016+ |
| 🌐 **Internet** | Conexão ativa |
| ⏱️ **Tempo** | 5-10 minutos |
| 👤 **Acesso** | Administrador do computador |

---

## 🚀 Instalação em 5 Passos

### Passo 1: Faça Login no Painel

1. Acesse o painel do CyberShield
2. Use o email e senha que você cadastrou
3. Você será direcionado ao Dashboard principal

> 💡 **Primeira vez?** Clique em "Criar Conta" e siga as instruções

---

### Passo 2: Gere uma Chave de Instalação

1. No menu lateral esquerdo, clique em **"Instalador de Agentes"**
2. Digite um nome para identificar o computador:
   - Exemplos bons: `PC-Joao`, `Notebook-Vendas`, `Servidor-Principal`
   - Evite: nomes genéricos como `teste` ou `computador`
3. Clique no botão **"Gerar Instalador"**
4. Um comando aparecerá na tela - **não feche esta janela!**

---

### Passo 3: Abra o PowerShell como Administrador

**No Windows 10/11:**
1. Clique com o **botão direito** no botão Iniciar (ícone do Windows)
2. Selecione **"Windows PowerShell (Admin)"** ou **"Terminal (Admin)"**
3. Se aparecer uma janela perguntando "Deseja permitir?", clique em **Sim**

**No Windows Server:**
1. Pressione `Win + X`
2. Selecione **"Windows PowerShell (Admin)"**

> ⚠️ **Importante**: O PowerShell DEVE ser aberto como Administrador, caso contrário a instalação falhará!

---

### Passo 4: Execute o Comando de Instalação

1. Volte ao painel do CyberShield
2. Clique no botão **"Copiar Comando"** ao lado do comando gerado
3. No PowerShell, **clique com botão direito** para colar o comando
4. Pressione **Enter**
5. Aguarde 30-60 segundos

**O que você verá:**
```
[INFO] Iniciando instalação do CyberShield Agent...
[INFO] Conectando ao servidor...
[INFO] Agente instalado com sucesso!
[INFO] Primeira comunicação estabelecida.
```

---

### Passo 5: Verifique a Instalação

1. Volte ao painel do CyberShield
2. Clique em **"Dashboard"** no menu lateral
3. Seu computador deve aparecer na lista de **"Computadores Protegidos"**
4. O status deve mostrar **🟢 Conectado** (verde)

> ⏳ **Nota**: Pode levar até 2 minutos para o computador aparecer no painel

---

## ✅ Checklist de Sucesso

Use esta lista para confirmar que tudo está funcionando:

- [ ] Login realizado no painel
- [ ] Chave de instalação gerada
- [ ] PowerShell aberto como Administrador
- [ ] Comando executado sem erros
- [ ] Computador aparece no Dashboard
- [ ] Status mostra "Conectado" (verde)
- [ ] Métricas de CPU/RAM/Disco sendo exibidas

---

## 📊 Próximos Passos

Após a instalação bem-sucedida, o agente automaticamente:

### Coleta de Dados (automático)
- 📈 **Métricas de sistema**: CPU, memória, disco a cada 30 segundos
- 📦 **Software instalado**: Lista completa de programas
- 🛡️ **Status do antivírus**: Windows Defender e outros
- 🌐 **Atividade web**: Histórico de navegação (se habilitado)

### O que você pode fazer
- **Ver métricas em tempo real** → Menu "Monitoramento"
- **Verificar software instalado** → Menu "Inventário de Software"
- **Gerar relatórios** → Menu "Relatórios"
- **Adicionar mais computadores** → Repetir este processo

---

## ❓ Problemas Comuns e Soluções

### 🔴 "O comando deu erro"

**Possíveis causas:**
1. PowerShell não está como Administrador
2. Chave de instalação expirou (válida por 24 horas)
3. Firewall bloqueando a conexão

**Soluções:**
- Feche o PowerShell e abra novamente **como Administrador**
- Gere uma nova chave de instalação no painel
- Verifique se não há firewall bloqueando `*.supabase.co`

---

### 🔴 "Computador não aparece no Dashboard"

**Possíveis causas:**
1. Instalação não foi concluída
2. Ainda está processando (aguarde 2 minutos)
3. Erro de conexão com internet

**Soluções:**
- Aguarde 2 minutos e atualize a página (F5)
- Verifique se o computador tem acesso à internet
- Execute o comando novamente

---

### 🔴 "Status mostra Desconectado"

**Possíveis causas:**
1. Computador está desligado ou em hibernação
2. Antivírus bloqueou o agente
3. Conexão de internet instável

**Soluções:**
- Verifique se o computador está ligado
- Adicione exceção no antivírus para `C:\CyberShield\`
- Reinicie o computador

---

### 🔴 "Erro de SSL/TLS"

**Causa:**
Versão antiga do Windows ou TLS desabilitado

**Solução:**
Execute este comando antes da instalação:
```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
```

---

## 🔧 Comandos Úteis

### Verificar se o agente está rodando
```powershell
Get-ScheduledTask | Where-Object {$_.TaskName -like "*CyberShield*"}
```

### Reinstalar o agente (se necessário)
1. Remova a instalação atual:
```powershell
Remove-Item -Recurse -Force "C:\CyberShield" -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "CyberShield*" -Confirm:$false -ErrorAction SilentlyContinue
```
2. Gere uma nova chave no painel
3. Execute a instalação novamente

---

## 📞 Precisa de Ajuda?

Nossa equipe está pronta para ajudar:

| Canal | Contato |
|-------|---------|
| 📱 **WhatsApp** | +55 34 98443-2835 |
| 📧 **Email** | suporte@cybershield.com.br |
| 💬 **Chat** | Disponível no painel (canto inferior direito) |

**Horário de Atendimento:**
- Segunda a Sexta: 8h às 18h
- Sábado: 8h às 12h

---

## 📚 Documentação Adicional

- [Guia de Instalação Técnico](/docs/installation)
- [FAQ - Perguntas Frequentes](/docs/faq)
- [Políticas de Segurança](/docs/security-policies)
- [Termos de Uso](/terms)
- [Política de Privacidade](/privacy)

---

<div align="center">

**🛡️ CyberShield** - Proteção Inteligente para seu Negócio

*Desenvolvido com ❤️ para proteger pequenas e médias empresas*

</div>
