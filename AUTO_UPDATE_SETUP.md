# 🔄 AUTO-UPDATE - Configuração do electron-updater

## 📋 O que foi implementado

✅ **electron-updater** instalado (v6.1.7)  
✅ Verificação automática de updates ao iniciar o app  
✅ Download em background com progresso  
✅ Diálogos nativos para notificar o usuário  
✅ Instalação automática ao fechar o app  
✅ Logs detalhados com electron-log  

---

## 🔧 Como Funciona

### Fluxo de Atualização

1. **App inicia** → Aguarda 3 segundos → Verifica atualizações
2. **Update disponível** → Pergunta ao usuário se quer baixar
3. **Usuário aceita** → Download em background (progresso na barra de título)
4. **Download concluído** → Pergunta se quer reiniciar agora
5. **Usuário aceita reiniciar** → App fecha e instala nova versão
6. **App reinicia** → Versão atualizada rodando

### Eventos Implementados

```javascript
autoUpdater.on('checking-for-update')    // Iniciou verificação
autoUpdater.on('update-available')       // Nova versão encontrada
autoUpdater.on('update-not-available')   // App está atualizado
autoUpdater.on('download-progress')      // Progresso do download
autoUpdater.on('update-downloaded')      // Download concluído
autoUpdater.on('error')                  // Erro no processo
```

---

## 🚀 Configuração para Produção

### PASSO 1: Configurar GitHub Releases

Edite `electron-builder.yml` e substitua os placeholders:

```yaml
publish:
  provider: github
  owner: SEU_USERNAME_GITHUB      # ⚠️ ALTERAR
  repo: SEU_REPOSITORIO           # ⚠️ ALTERAR
  releaseType: release
```

**Exemplo:**
```yaml
publish:
  provider: github
  owner: cybershield-org
  repo: cybershield-desktop
  releaseType: release
```

---

### PASSO 2: Gerar GitHub Personal Access Token

1. Acesse: https://github.com/settings/tokens/new
2. **Nome:** `CyberShield Auto-Update`
3. **Scopes necessários:**
   - ✅ `repo` (Full control of private repositories)
   - ✅ `write:packages` (se usar GitHub Packages)
4. Clique em **Generate token**
5. **COPIE O TOKEN** (só aparece uma vez!)

---

### PASSO 3: Configurar Token no Sistema de Build

#### Opção A: Variável de Ambiente Local

**Windows:**
```powershell
# PowerShell
$env:GH_TOKEN = "ghp_sua_token_aqui"

# Ou adicionar permanentemente em System Properties > Environment Variables
```

**Linux/Mac:**
```bash
export GH_TOKEN="ghp_sua_token_aqui"

# Ou adicionar no ~/.bashrc ou ~/.zshrc
echo 'export GH_TOKEN="ghp_sua_token_aqui"' >> ~/.bashrc
```

#### Opção B: GitHub Actions (CI/CD)

Adicione o token nos **Repository Secrets**:

1. Vá em: `Settings > Secrets and variables > Actions`
2. Clique em **New repository secret**
3. Nome: `GH_TOKEN`
4. Valor: `ghp_sua_token_aqui`

No workflow `.github/workflows/build-desktop.yml`, use:

```yaml
- name: Build Desktop App
  run: npm run build:exe
  env:
    GH_TOKEN: ${{ secrets.GH_TOKEN }}
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
```

---

### PASSO 4: Build e Publicação

#### Build Local (com publish para GitHub)

```bash
# Build normal (gera .exe mas NÃO publica)
npm run build:exe

# Build com publish (gera .exe E publica no GitHub Releases)
npm run build:electron -- --publish always
```

#### Build via CI/CD (GitHub Actions)

1. Faça um git tag com a versão:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. O GitHub Actions será disparado automaticamente
3. O build será gerado e publicado em **Releases**

---

### PASSO 5: Estrutura de Release no GitHub

Após o build, o GitHub Releases terá:

```
📦 v1.0.0
├── CyberShield-1.0.0-win-x64.exe  (instalador para usuários)
├── latest.yml                      (metadata para electron-updater)
└── Release Notes (opcional)
```

O arquivo `latest.yml` contém:
```yaml
version: 1.0.0
files:
  - url: CyberShield-1.0.0-win-x64.exe
    sha512: [hash_do_arquivo]
    size: [tamanho_em_bytes]
path: CyberShield-1.0.0-win-x64.exe
sha512: [hash_do_arquivo]
releaseDate: '2025-01-01T00:00:00.000Z'
```

---

## 🧪 Testar Auto-Update Localmente

### Método 1: Servidor Local (dev-app-update.yml)

Crie `electron/dev-app-update.yml`:

```yaml
version: 1.0.1
files:
  - url: http://localhost:8080/CyberShield-1.0.1-win-x64.exe
    sha512: [calcular_hash]
    size: [tamanho_arquivo]
path: CyberShield-1.0.1-win-x64.exe
releaseDate: '2025-01-01T00:00:00.000Z'
```

Modifique `electron/main.js` temporariamente:

```javascript
// DEV ONLY: testar auto-update localmente
if (process.env.NODE_ENV === 'development') {
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'http://localhost:8080'
  });
}
```

### Método 2: GitHub Releases (real)

1. Faça build da versão 1.0.0 e publique
2. Instale a versão 1.0.0 no seu PC
3. Faça build da versão 1.0.1 e publique
4. Abra o app v1.0.0 → Deve detectar v1.0.1

---

## 📊 Logs e Debug

### Localização dos Logs

**Windows:**
```
%USERPROFILE%\AppData\Roaming\CyberShield\logs\main.log
```

**Visualizar logs em tempo real:**
```javascript
// No electron/main.js
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'debug';
```

### Logs típicos:

```
[2025-01-01 10:00:00.123] [info] 🔍 Verificando atualizações...
[2025-01-01 10:00:01.456] [info] ✅ Atualização disponível: 1.0.1
[2025-01-01 10:00:05.789] [info] Download: 25.00% (32MB/128MB)
[2025-01-01 10:00:10.123] [info] ✅ Atualização baixada: 1.0.1
```

---

## 🔒 Segurança

### Validação de Assinatura

O electron-updater **valida automaticamente** a assinatura dos updates.

Para produção, **SEMPRE** assine o `.exe`:

```powershell
# Com certificado Code Signing
signtool sign /f MeuCertificado.pfx /p senha /tr http://timestamp.digicert.com /td sha256 /fd sha256 CyberShield-1.0.0-win-x64.exe
```

Adicione ao `electron-builder.yml`:

```yaml
win:
  sign: ./sign.js  # Script customizado de assinatura
  signingHashAlgorithms:
    - sha256
```

---

## ⚙️ Configurações Avançadas

### Verificar Updates Manualmente

Adicione um botão "Verificar Atualizações" no app:

```javascript
// No componente React
const checkForUpdates = () => {
  // Chamar IPC do Electron
  window.electron.ipcRenderer.send('check-for-updates');
};
```

No `electron/main.js`:

```javascript
const { ipcMain } = require('electron');

ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdates();
});
```

### Update Channels (Stable, Beta, Alpha)

```yaml
# electron-builder.yml
publish:
  provider: github
  owner: cybershield-org
  repo: cybershield-desktop
  releaseType: release  # ou 'prerelease' para beta
```

No código:

```javascript
autoUpdater.channel = 'beta';  // 'latest' (default), 'beta', 'alpha'
```

### Desabilitar Auto-Update (se necessário)

```javascript
// Útil para ambientes corporativos gerenciados
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
```

---

## 📋 Checklist de Produção

- [ ] Token GH_TOKEN configurado
- [ ] `electron-builder.yml` com owner/repo corretos
- [ ] Certificado Code Signing adquirido e configurado
- [ ] Primeira versão (v1.0.0) publicada no GitHub Releases
- [ ] App instalado em PC de teste detecta updates
- [ ] Logs de update funcionando corretamente
- [ ] Assinatura digital validada pelo Windows
- [ ] CI/CD configurado para builds automáticos

---

## 🐛 Troubleshooting

### Erro: "Cannot find latest.yml"
- Certifique-se que o build foi publicado no GitHub Releases
- Verifique se `GH_TOKEN` está configurado
- Verifique se `electron-builder.yml` tem `publish:` configurado

### Erro: "HttpError: 404"
- Owner/repo no `electron-builder.yml` estão corretos?
- Release está público (não draft)?
- Token tem permissões de `repo`?

### Update não é detectado
- Versão atual é menor que a versão no Release?
- `latest.yml` existe no Release?
- Logs em `%APPDATA%\CyberShield\logs\main.log` mostram erros?

### Download falha
- Release contém o arquivo `.exe`?
- Nome do arquivo em `latest.yml` está correto?
- GitHub Releases está acessível (não rate limited)?

---

## 📞 Recursos Adicionais

- **Docs do electron-updater:** https://www.electron.build/auto-update
- **GitHub Releases API:** https://docs.github.com/en/rest/releases
- **electron-log Docs:** https://github.com/megahertz/electron-log

---

**Status:** ✅ Auto-update implementado e pronto para configuração
