# Welcome to your Lovable project

## 🔧 Pré-requisitos

Antes de iniciar, certifique-se de ter instalado:

- **Node.js** >= 18.0.0 - [Download](https://nodejs.org/)
- **npm** >= 9.0.0 (vem com Node.js)

Para verificar as versões instaladas:

```bash
node --version
npm --version
```

## 🚀 Instalação Rápida

```bash
# 1. Clone o repositório
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# 2. Instale dependências
npm install

# 3. Configure variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais do Supabase

# 4. Execute em modo desenvolvimento
npm run dev
```

Acesse: http://localhost:8080

## 📖 Documentação Técnica

Para informações detalhadas sobre arquitetura e troubleshooting:

### Instalação e Configuração
- 📋 [Setup Completo](SETUP.md) - Instalação e configuração detalhadas
- 🍎 [Guia de Instalação macOS](docs/MACOS_INSTALLATION_GUIDE.md) - Instalação em macOS (Catalina+)
- 🔏 [Code Signing macOS](docs/MACOS_CODE_SIGNING.md) - Assinatura e notarização Apple
- 🌐 [Suporte a Proxy macOS](docs/MACOS_PROXY_SUPPORT.md) - Configuração de proxy corporativo

### Arquitetura e Segurança
- 📐 [Arquitetura do Instalador](docs/INSTALLER_ARCHITECTURE.md) - Fluxo completo, componentes e segurança
- 🛡️ [Arquitetura de Segurança](docs/SECURITY_ARCHITECTURE.md) - RLS, HMAC, SHA256
- 🔄 [Sincronização do Script do Agente](docs/AGENT_SCRIPT_SYNC.md) - Sistema automático de atualização

### Troubleshooting
- 🔧 [Guia de Troubleshooting](docs/TROUBLESHOOTING_INSTALLER.md) - Soluções para problemas comuns
- 🩺 [Diagnósticos do Sistema](docs/SYSTEM_DIAGNOSTICS.md) - Queries SQL e ferramentas de diagnóstico
- 📋 [Checklist de Deployment](docs/DEPLOYMENT_CHECKLIST.md) - Validação pré e pós-deployment

### Validação e Testes
- ✅ [Script de Validação de Installers](scripts/verificar-installer-agente.ps1) - Validação local de encoding, sintaxe e integridade
- 🔍 [Queries de Diagnóstico](scripts/diagnostic-queries.sql) - Biblioteca completa de queries SQL para troubleshooting

---

## Project info

**URL**: https://lovable.dev/projects/affc1ab5-463f-41f7-ae33-f788e864f6ee

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/affc1ab5-463f-41f7-ae33-f788e864f6ee) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/affc1ab5-463f-41f7-ae33-f788e864f6ee) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
