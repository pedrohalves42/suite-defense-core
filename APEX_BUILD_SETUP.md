# 🚀 APEX-BUILD - Configuração Manual Necessária

## ⚠️ AÇÕES MANUAIS OBRIGATÓRIAS

A estrutura Electron foi criada, mas você precisa completar 3 passos manualmente:

---

## 📝 PASSO 1: Adicionar Scripts ao package.json

Abra `package.json` e adicione/modifique a seção `scripts`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:dev": "vite build --mode development",
    "clean": "rimraf dist build electron/dist || true",
    "build:web": "vite build",
    "postbuild:web": "echo ✅ Build Vite concluído em ./dist",
    "build:electron:prep": "node ./electron/scripts/prepare.js",
    "build:electron": "electron-builder --win --x64",
    "start:electron": "electron .",
    "build:exe": "npm run clean && npm run build:web && npm run build:electron:prep && npm run build:electron",
    "validate:exe": "node electron/scripts/validate.js",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

---

## 🎯 PASSO 2: Adicionar Entry Point ao package.json

No mesmo `package.json`, adicione no **root** (não dentro de scripts):

```json
{
  "main": "electron/main.js",
  "scripts": { ... },
  ...
}
```

---

## 🖼️ PASSO 3: Criar Ícone do Aplicativo

1. Crie a pasta: `electron/resources/`
2. Coloque um ícone `.ico` (256x256px) chamado `icon.ico` dentro dessa pasta
3. Sugestão: Converter o favicon atual usando https://icoconvert.com/

**Caminho esperado:** `electron/resources/icon.ico`

---

## ✅ Verificação

Após completar os 3 passos, execute:

```bash
npm install
npm run build:exe
```

Se tudo estiver correto, você verá:
- ✅ Build do Vite concluído
- ✅ Arquivos copiados para electron/web
- ✅ .exe gerado em `electron/dist/`

---

## 🔧 Comandos Disponíveis

```bash
# Build completo (gera o .exe)
npm run build:exe

# Validar .exe gerado
npm run validate:exe

# Testar localmente (sem gerar .exe)
npm run build:web
npm run build:electron:prep
npm run start:electron

# Limpar artefatos de build
npm run clean
```

---

## 📋 Estrutura de Arquivos Criada

```
✅ electron/main.js                    - Processo principal do Electron
✅ electron/scripts/prepare.js         - Copia build Vite para Electron
✅ electron/scripts/afterPack.js       - Validação pós-build
✅ electron/scripts/validate.js        - Relatório de validação
✅ electron-builder.yml                - Configuração do builder
✅ .github/workflows/build-desktop.yml - CI/CD (opcional)
✅ vite.config.ts                      - Ajustado com base: './'
⚠️ electron/resources/icon.ico        - VOCÊ PRECISA CRIAR
⚠️ package.json                        - VOCÊ PRECISA EDITAR (scripts + main)
```

---

## 🚨 Troubleshooting

### Erro: "Cannot find module 'electron'"
```bash
npm install
```

### Erro: "dist/ do Vite não encontrado"
```bash
npm run build:web
```

### Erro: "icon.ico not found"
- Crie `electron/resources/icon.ico` (256x256px)

### .exe não é gerado
1. Verifique se `package.json` tem `"main": "electron/main.js"`
2. Verifique se todos os scripts foram adicionados
3. Execute `npm run build:exe` novamente

---

## 📞 Próximos Passos

Após gerar o `.exe` com sucesso:

1. **Testar instalação:** Execute o `.exe` em uma VM limpa
2. **Validar funcionalidades:** Login, dashboard, agentes, etc.
3. **Gerar relatório:** Preencha o template em `Relatorio_APEX_BUILD.md`
4. **Configurar auto-update:** Siga instruções em `AUTO_UPDATE_SETUP.md`
5. **Assinatura digital:** Adquirir certificado Code Signing (produção)

---

## 🔄 Auto-Update

O sistema de auto-update já está implementado com **electron-updater**.

Para configurar:
1. Leia `AUTO_UPDATE_SETUP.md` para instruções completas
2. Configure GitHub Personal Access Token
3. Edite `electron-builder.yml` com seu owner/repo
4. Faça build com `--publish always`

---

**Status:** 🟡 Aguardando ações manuais (PASSO 1, 2 e 3)
