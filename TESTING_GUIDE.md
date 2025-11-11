# 🧪 GUIA DE TESTES E2E - CyberShield

## 📋 Execução Rápida

### Linux/Mac
```bash
chmod +x run-e2e-tests.sh
./run-e2e-tests.sh
```

### Windows
```powershell
.\run-e2e-tests.ps1
```

---

## 🧪 Testes Individuais

### 1. Download de Instaladores
```bash
npx playwright test e2e/installer-download.spec.ts
```

### 2. Validação de Heartbeat
```bash
npx playwright test e2e/heartbeat-validation.spec.ts
```

### 3. Fluxo Completo
```bash
npx playwright test e2e/complete-agent-flow.spec.ts
```

---

## 📊 Relatórios

### Gerar Relatório HTML
```bash
npx playwright test --reporter=html
npx playwright show-report
```

---

## 🔍 Debug

### Modo Debug
```bash
DEBUG=pw:api npx playwright test
```

### UI Interativa
```bash
npx playwright test --ui
```

---

## ✅ Checklist de Validação

- [ ] Todos os testes passam (100%)
- [ ] Instaladores gerados sem placeholders
- [ ] Agentes conectam em < 60s
- [ ] Métricas aparecem em < 5min
- [ ] Jobs executam com sucesso
- [ ] Dashboard mostra status "active"

---

## 📞 Documentos Relacionados

- `AGENT_DIAGNOSTICS_REPORT.md` - Diagnóstico de agentes desconectados
- `VALIDATION_GUIDE.md` - Guia de validação manual
- `PLANO_CORRECAO_EXECUTADO.md` - Plano de correção completo
