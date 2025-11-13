# Arquitetura do CyberShield

## Visão Geral dos 3 Sistemas Independentes

O projeto CyberShield possui **três sistemas distintos** que frequentemente são confundidos. Esta documentação esclarece cada um deles.

---

## 1. 🐍 AGENTE PYTHON (Servidor-side)

### Descrição
Executável que roda nos servidores/máquinas dos clientes, responsável por executar jobs, enviar heartbeats e coletar métricas do sistema.

### Detalhes Técnicos
- **Localização:** `agent/`
- **Tecnologia:** Python 3.11 + PyInstaller
- **Outputs:** 
  - Windows: `cybershield-agent.exe`
  - Linux: `cybershield-agent` (binário ELF)
- **Runtime:** Standalone (não requer Python instalado)
- **Configuração:** `agent_config.json` (gerado durante instalação)

### Build Pipeline
- **Workflow:** `.github/workflows/build-python-agent.yml`
- **Trigger:** Manual ou push para `main` (quando `agent/**` muda)
- **Processo:**
  1. Checkout do código
  2. Setup Python 3.11
  3. Instalação de dependências (`requirements.txt`)
  4. Compilação com PyInstaller (`agent/build.py`)
  5. Cálculo de SHA256 e tamanho
  6. Upload para Supabase Storage (`agent-executables/`)
  7. Registro na tabela `agent_versions`

### Distribuição
- **Storage:** Supabase Storage bucket `agent-executables`
- **Metadata:** Tabela `public.agent_versions`
- **Acesso:** Agentes consultam via Edge Function `check-agent-updates`

### Scripts Locais
- `agent/build-local.ps1` - Build local no Windows
- `agent/build-local.sh` - Build local no Linux
- `agent/validate-build.ps1` - Validação do executável gerado

---

## 2. 📜 INSTALADOR POWERSHELL (Cliente-side)

### Descrição
Script PowerShell que baixa e configura o Agente Python no servidor do cliente. Pode ser distribuído como `.ps1` (script) ou `.exe` (compilado).

### Detalhes Técnicos
- **Localização:** `public/templates/install-windows-*.ps1`
- **Tecnologia:** PowerShell 5.1+
- **Outputs:**
  - `.ps1`: Script executável diretamente
  - `.exe`: Compilado com `ps2exe` (opcional)
- **Geração:** On-demand via Edge Function `serve-installer`

### Build Pipeline (EXE)
- **Workflow:** `.github/workflows/build-agent-exe.yml`
- **Trigger:** Chamada via Edge Function `build-agent-exe`
- **Processo:**
  1. Edge Function cria registro em `agent_builds`
  2. Workflow GitHub Actions é disparado
  3. Download do template `.ps1` via `serve-installer`
  4. Compilação com `ps2exe` (com 3 tentativas de retry)
  5. Cálculo de SHA256
  6. Upload para Supabase Storage (`agent-installers/`)
  7. Callback para atualizar `agent_builds` com status

### Distribuição
- **Via Script:** Download direto do `.ps1` gerado pela Edge Function
- **Via EXE:** Download do bucket `agent-installers` após build
- **Comando One-Click:** `irm URL | iex` (baixa e executa diretamente)

### Fluxo de Instalação
```
1. Usuário executa instalador (PS1 ou EXE)
2. Instalador verifica privilégios de admin
3. Cria diretórios: C:\CyberShield, C:\CyberShield\logs
4. Baixa executável do Agent Python do Supabase Storage
5. Cria agent_config.json com credenciais
6. Registra Scheduled Task para rodar agente 24/7
7. Inicia agente imediatamente
8. Envia telemetria de instalação
```

### Scripts de Teste
- `tests/installer-validation.ps1` - Teste local do instalador

---

## 3. 🖥️ APLICAÇÃO DESKTOP ELECTRON (Admin UI)

### Descrição
Interface desktop para administradores gerenciarem o sistema CyberShield offline ou com acesso local ao backend.

### Detalhes Técnicos
- **Localização:** `electron/`
- **Tecnologia:** Electron + React/Vite + TypeScript
- **Output:** `CyberShield-Setup.exe` (instalador desktop)
- **Runtime:** Chromium embutido + Node.js

### Build Pipeline
- **Ferramenta:** `electron-builder`
- **Config:** `electron-builder.yml`
- **Processo:**
  1. Build do frontend React/Vite (`npm run build`)
  2. Cópia do build para `electron/dist`
  3. Empacotamento com Electron
  4. Geração de instalador Windows (NSIS)

### Distribuição
- **Método:** GitHub Releases (manual ou via CI)
- **Público:** Administradores de sistema
- **Uso:** Dashboard local, configurações avançadas

### Nota Importante
⚠️ **Este sistema NÃO se confunde com o instalador do agente!**
- Electron Desktop = UI administrativa
- Instalador PowerShell = Script que instala o agente Python

---

## 📊 Diagrama de Fluxo Completo

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN (Web Dashboard)                    │
│              https://cybershield.app/admin                  │
└────────────┬────────────────────────────────────────────────┘
             │
             │ 1. Clica "Generate Installer"
             ▼
┌─────────────────────────────────────────────────────────────┐
│          Edge Function: serve-installer                     │
│  - Busca agent_versions (última versão do Python Agent)     │
│  - Gera template PS1 com credenciais                        │
│  - Retorna PS1 ou dispara build do EXE                      │
└────────────┬────────────────────────────────────────────────┘
             │
             │ 2. Template PS1 gerado
             ▼
┌─────────────────────────────────────────────────────────────┐
│     GitHub Actions: build-agent-exe (opcional)              │
│  - Compila PS1 → EXE com ps2exe                             │
│  - Upload para Supabase Storage                             │
└────────────┬────────────────────────────────────────────────┘
             │
             │ 3. Usuário baixa instalador (PS1 ou EXE)
             ▼
┌─────────────────────────────────────────────────────────────┐
│          SERVIDOR DO CLIENTE (Windows Server)               │
│  - Executa instalador como Admin                            │
│  - Baixa cybershield-agent.exe do Storage                   │
│  - Cria Scheduled Task                                      │
│  - Inicia agente                                            │
└────────────┬────────────────────────────────────────────────┘
             │
             │ 4. Agente envia heartbeats, executa jobs
             ▼
┌─────────────────────────────────────────────────────────────┐
│               Edge Functions (Backend)                      │
│  - /heartbeat                                               │
│  - /poll-jobs                                               │
│  - /ack-job                                                 │
│  - /check-agent-updates (auto-update)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Sistema de Auto-Update

### Para o Agent Python
1. Agente chama Edge Function `check-agent-updates` a cada 6h
2. Edge Function retorna versão mais recente de `agent_versions`
3. Se nova versão disponível:
   - Agente baixa novo executável
   - Valida SHA256
   - Substitui executável antigo
   - Reinicia (via Scheduled Task)

### Para o Instalador
Não há auto-update do instalador. Cada instalação sempre baixa a versão mais recente do Agent Python automaticamente.

---

## 📁 Estrutura de Diretórios

```
cybershield/
├── agent/                          # ⚡ Agent Python
│   ├── main.py                     # Entry point
│   ├── config.py                   # Configuração
│   ├── auto_updater.py             # Sistema de updates
│   ├── build.py                    # Script de build local
│   ├── build-local.ps1             # Build Windows
│   ├── build-local.sh              # Build Linux
│   ├── validate-build.ps1          # Validação
│   └── requirements.txt
│
├── public/
│   ├── templates/
│   │   ├── install-windows-template.ps1  # Template do instalador
│   │   └── install-linux-template.sh
│   └── agent-scripts/
│       └── cybershield-agent-windows.ps1 # Script do agente (embutido no instalador)
│
├── supabase/functions/
│   ├── serve-installer/            # Gera instalador on-demand
│   ├── build-agent-exe/            # Dispara build do EXE
│   ├── check-agent-updates/        # Endpoint de auto-update
│   └── ...
│
├── electron/                       # 🖥️ Desktop App (Admin UI)
│   ├── main.js
│   └── resources/
│
├── .github/workflows/
│   ├── build-python-agent.yml      # Build do Agent Python
│   └── build-agent-exe.yml         # Build do Instalador EXE
│
├── docs/
│   ├── ARCHITECTURE_OVERVIEW.md    # 📄 Este arquivo
│   ├── AGENT_EXECUTABLE_GUIDE.md   # Guia do executável Python
│   └── INSTALLER_TROUBLESHOOTING.md
│
└── tests/
    └── installer-validation.ps1
```

---

## ❓ FAQ: Confusões Comuns

### "O EXE do agente não funciona" - Qual EXE?

Existem **TRÊS** executáveis diferentes:

1. **`cybershield-agent.exe`** (Agent Python)
   - Gerado por: PyInstaller no workflow `build-python-agent.yml`
   - Roda em: Servidor do cliente
   - Função: Executar jobs, heartbeats

2. **`CyberShield-Installer-AGENTNAME.exe`** (Instalador compilado)
   - Gerado por: ps2exe no workflow `build-agent-exe.yml`
   - Roda em: Servidor do cliente (uma vez)
   - Função: Instalar o `cybershield-agent.exe`

3. **`CyberShield-Setup.exe`** (Electron Desktop)
   - Gerado por: electron-builder (processo manual)
   - Roda em: Máquina do admin
   - Função: Dashboard local

### "Por que o workflow build-python-agent nunca executou?"

Porque ele só é disparado:
- **Manualmente** via GitHub Actions UI
- **Automaticamente** quando há push para `main` que modifica `agent/**`

Para disparar manualmente:
1. GitHub → Actions → "Build Python Agent"
2. Run workflow
3. Input: versão (ex: `1.0.0`)

### "A tabela agent_versions está vazia"

Isso indica que `build-python-agent.yml` nunca completou com sucesso. Execute manualmente conforme acima.

---

## 🚀 Quick Start para Desenvolvedores

### Build Local do Agent Python
```bash
cd agent
./build-local.sh   # Linux
# ou
.\build-local.ps1  # Windows
```

### Testar Instalador Localmente
```bash
cd agent
# Gerar instalador via dashboard em /admin/agent-installer
# Baixar o .ps1

# Testar sem compilar
pwsh -NoProfile -ExecutionPolicy Bypass -File installer.ps1
```

### Build Electron Desktop (Admin UI)
```bash
npm run build           # Build frontend
npm run electron:build  # Build Electron app
```

---

## 📞 Suporte

- **Documentação Completa:** `/docs`
- **Issues:** GitHub Issues
- **Logs de Build:** GitHub Actions → Workflow runs
