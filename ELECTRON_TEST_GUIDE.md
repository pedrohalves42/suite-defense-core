# 🚀 Guia de Teste - Aplicação Electron CyberShield

## 📋 Pré-requisitos

Certifique-se de que todas as dependências estão instaladas:

```bash
npm install
```

---

## 🧪 FASE 1: Teste Local da Aplicação Electron

### Passo 1: Build do Frontend (Vite)

```bash
npm run build:web
```

**✅ Resultado esperado:**
- Pasta `dist/` criada com arquivos HTML, CSS, JS
- Build concluído sem erros

### Passo 2: Preparar Pacote Electron

```bash
npm run build:electron:prep
```

**✅ Resultado esperado:**
- Pasta `electron/web/` criada
- Arquivos do `dist/` copiados para `electron/web/`
- Mensagem: "✅ Build Vite copiado com sucesso!"

### Passo 3: Iniciar Aplicação Electron Localmente

```bash
npm run start:electron
```

**✅ Resultado esperado:**
- Janela do Electron abre (1400x900px)
- Aplicação CyberShield carrega corretamente
- Interface funcional e responsiva
- Console mostra: "🔍 Verificando atualizações..." e "ℹ️ Aplicativo está atualizado"

### ⚠️ Troubleshooting - Fase 1

| Erro | Solução |
|------|---------|
| `dist/ do Vite não encontrado` | Execute `npm run build:web` primeiro |
| `index.html não encontrado` | Verifique se `electron/web/index.html` existe |
| Tela branca | Abra DevTools (Ctrl+Shift+I) e verifique erros no console |
| Erro de assets | Confirme que `vite.config.ts` tem `base: './'` |

---

## 📦 FASE 2: Gerar Instalador Windows (.exe)

### Passo 1: Build Completo do Instalador

```bash
npm run build:exe
```

**⏱️ Tempo estimado:** 2-5 minutos

**✅ Resultado esperado:**
```
🔧 [APEX-BUILD] Limpando diretórios...
🔨 [APEX-BUILD] Building Vite...
📦 [APEX-BUILD] Preparando pacote Electron...
🏗️ [APEX-BUILD] Gerando instalador com electron-builder...
🔍 [APEX-BUILD] Executando validações pós-empacotamento...
✅ Build concluído! Instalador em: electron/dist/
```

**📂 Arquivos gerados em `electron/dist/`:**
- `CyberShield-X.X.X-win-x64.exe` (instalador NSIS)
- `builder-effective-config.yaml`
- Outros arquivos auxiliares do electron-builder

### Passo 2: Validar Instalador Gerado

```bash
npm run validate:exe
```

**✅ Resultado esperado:**
```
📋 RELATÓRIO DE VALIDAÇÃO APEX-BUILD
============================================================

📦 Arquivo: CyberShield-2.2.0-win-x64.exe
   Tamanho: ~120-180 MB
   SHA256: [hash completo]
   Criado em: [timestamp ISO]

============================================================
✅ Validações concluídas!
```

### Passo 3: Testar o Instalador

1. **Navegue até a pasta:**
   ```bash
   cd electron/dist
   ```

2. **Execute o instalador:**
   ```bash
   .\CyberShield-X.X.X-win-x64.exe
   ```

3. **Verifique a instalação:**
   - Instalador NSIS de um clique abre
   - Aplicação é instalada em `%LOCALAPPDATA%\Programs\CyberShield`
   - Atalho criado na Área de Trabalho
   - Aplicação inicia corretamente após instalação

### ⚠️ Troubleshooting - Fase 2

| Erro | Solução |
|------|---------|
| `Nenhum .exe encontrado` | Execute `npm run build:exe` novamente |
| Build falha | Verifique se `electron/resources/icon.ico` existe |
| Instalador não inicia | Desative antivírus temporariamente (falso positivo comum) |
| Erro de permissão | Execute como Administrador ou verifique configuração NSIS |

---

## 🔍 Checklist de Validação Final

- [ ] Aplicação Electron abre localmente com `npm run start:electron`
- [ ] Interface carrega sem erros
- [ ] Navegação entre páginas funciona
- [ ] Instalador `.exe` é gerado com sucesso
- [ ] Tamanho do instalador está entre 120-180 MB
- [ ] SHA256 é calculado e exibido
- [ ] Instalador executa e instala a aplicação
- [ ] Atalho na Área de Trabalho é criado
- [ ] Aplicação instalada inicia corretamente
- [ ] Auto-updater verifica atualizações (sem erro)

---

## 📊 Próximos Passos (Opcional)

### 1. Configurar Auto-Update (GitHub Releases)

Edite `electron-builder.yml`:
```yaml
publish:
  provider: github
  owner: SEU_USUARIO
  repo: SEU_REPOSITORIO
  releaseType: release
```

Configure `GH_TOKEN` como variável de ambiente para publicação automatizada.

### 2. Assinatura Digital do Executável

Para produção, adquira um certificado de Code Signing (DigiCert, Sectigo) e configure:

```yaml
win:
  certificateFile: path/to/cert.pfx
  certificatePassword: ${env.CERT_PASSWORD}
```

### 3. Gerar Relatório de Build

Após validação bem-sucedida, documente os resultados no arquivo `Relatorio_APEX_BUILD.md`.

---

## 📞 Suporte

- **Documentação Electron:** https://www.electronjs.org/docs
- **Documentação electron-builder:** https://www.electron.build/
- **Guia de Build:** `BUILD_WINDOWS_INSTALLER.md`
- **Setup Manual:** `APEX_BUILD_SETUP.md`

---

✅ **Build e validação concluídos com sucesso!**
