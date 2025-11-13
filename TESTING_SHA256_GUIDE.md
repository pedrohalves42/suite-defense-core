# 🧪 Guia de Testes SHA256 - Scripts de Instalação

## 📋 Visão Geral

Este guia documenta os testes E2E implementados para validar a integridade SHA256 de scripts de instalação Windows (.PS1) e Linux (.SH).

## 🎯 Cobertura de Testes

### Arquivo: `e2e/ps1-sha256-validation.spec.ts`

#### Testes Backend (API)

1. **✅ Header X-Script-SHA256 para Windows**
   - Verifica que o header `X-Script-SHA256` está presente
   - Valida formato hexadecimal de 64 caracteres
   - Assegura que o hash é retornado corretamente pelo backend

2. **✅ Header X-Script-Size**
   - Verifica que o tamanho do script é retornado no header
   - Valida que o tamanho é maior que zero
   - Útil para validação de integridade complementar

3. **✅ Cálculo de Hash Correto**
   - Baixa o script via API
   - Calcula SHA256 local usando Node.js `crypto`
   - Compara hash calculado com hash do servidor
   - Garante que a geração de hash no backend está correta

4. **✅ Persistência no Banco de Dados**
   - Força geração do script
   - Query na tabela `enrollment_keys`
   - Verifica que `installer_sha256`, `installer_size_bytes` e `installer_generated_at` foram persistidos
   - Valida que o hash no DB corresponde ao hash retornado

5. **✅ Detecção de Mismatch**
   - Baixa script original
   - Modifica conteúdo para simular ataque MITM
   - Recalcula hash do script modificado
   - Verifica que os hashes são DIFERENTES
   - Confirma que a detecção de mismatch funcionaria

6. **✅ Validação para Linux (.SH)**
   - Cria agente Linux
   - Baixa script .SH via `serve-installer`
   - Valida headers `X-Script-SHA256` e `X-Script-Size`
   - Calcula hash local e compara com servidor
   - Garante paridade Windows/Linux na validação

7. **✅ Consistência de Hash**
   - Baixa mesmo script duas vezes com intervalo
   - Verifica que hash é idêntico em ambas requisições
   - Garante que geração é determinística

8. **✅ Rejeição de Key Inválida**
   - Tenta baixar script com enrollment key inválida
   - Verifica retorno 404
   - Valida mensagem de erro apropriada

9. **✅ Headers de Segurança**
   - Valida `X-Content-Type-Options: nosniff`
   - Valida `X-Frame-Options: DENY`
   - Verifica `Content-Type: text/plain`
   - Confirma `Content-Disposition: attachment`

#### Testes Frontend (UI)

10. **✅ Exibição de Hash no UI**
    - Navega para `/agent-installer`
    - Gera credenciais e baixa script
    - Aguarda mensagem "✅ Integridade verificada"
    - Verifica que hash SHA256 é exibido no UI
    - Confirma badge verde de validação

11. **✅ Copiar Hash para Clipboard**
    - Gera script e valida
    - Clica no botão de copiar
    - Verifica toast "Hash copiado"
    - Valida que clipboard contém hash de 64 caracteres hexadecimais

12. **✅ Bloqueio de Download em Mismatch (Simulado)**
    - Intercepta fetch para simular ataque MITM
    - Modifica body do script mas mantém header original
    - Verifica que frontend detecta mismatch
    - Valida exibição de erro crítico de segurança

---

## 🚀 Como Executar os Testes

### Pré-requisitos

1. Variáveis de ambiente configuradas:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   TEST_ADMIN_EMAIL=admin@test.com
   TEST_ADMIN_PASSWORD=secure-password
   ```

2. Usuário admin criado no Supabase Auth

### Executar todos os testes SHA256

```bash
# Todos os testes de validação SHA256
npx playwright test e2e/ps1-sha256-validation.spec.ts

# Com relatório HTML
npx playwright test e2e/ps1-sha256-validation.spec.ts --reporter=html
npx playwright show-report
```

### Executar testes específicos

```bash
# Apenas testes backend (API)
npx playwright test e2e/ps1-sha256-validation.spec.ts -g "SHA256 Validation - Scripts de Instalação"

# Apenas testes frontend (UI)
npx playwright test e2e/ps1-sha256-validation.spec.ts -g "SHA256 Validation - Frontend Integration"

# Teste específico
npx playwright test e2e/ps1-sha256-validation.spec.ts -g "deve retornar hash SHA256 no header"
```

### Modo Debug

```bash
# Debug interativo
npx playwright test e2e/ps1-sha256-validation.spec.ts --debug

# UI mode
npx playwright test e2e/ps1-sha256-validation.spec.ts --ui

# Headed mode (ver navegador)
npx playwright test e2e/ps1-sha256-validation.spec.ts --headed
```

---

## 📊 Resultado Esperado

Todos os testes devem passar com 100% de sucesso:

```
✅ deve retornar hash SHA256 no header X-Script-SHA256 para Windows
✅ deve retornar tamanho do script no header X-Script-Size
✅ deve calcular hash SHA256 do script baixado corretamente
✅ deve persistir hash no banco de dados enrollment_keys
✅ deve detectar mismatch quando hash é modificado
✅ deve validar SHA256 para script Linux (.sh)
✅ deve validar que scripts sem modificação têm hash consistente
✅ deve rejeitar enrollment key inválido
✅ deve incluir headers de segurança na resposta
✅ deve exibir hash SHA256 após validação bem-sucedida
✅ deve permitir copiar hash SHA256 completo
✅ deve bloquear download se hash SHA256 não corresponder

12 passed (45s)
```

---

## 🔍 Troubleshooting

### Teste falha: "Hash no header não encontrado"

**Causa:** Backend não está retornando header `X-Script-SHA256`

**Solução:**
1. Verificar que `serve-installer/index.ts` foi atualizado
2. Confirmar que Edge Function foi deployed
3. Verificar logs do Edge Function:
   ```bash
   supabase functions logs serve-installer
   ```

### Teste falha: "Hash mismatch detectado"

**Causa:** Hash calculado no frontend/backend está incorreto

**Solução:**
1. Verificar encoding (UTF-8) do script
2. Confirmar que não há modificações extras (BOM, line endings)
3. Validar que `crypto.subtle.digest` está usando SHA-256

### Teste falha: "Hash não persistido no DB"

**Causa:** Migration não foi executada ou RLS bloqueando

**Solução:**
1. Executar migration:
   ```sql
   ALTER TABLE enrollment_keys 
   ADD COLUMN installer_sha256 TEXT,
   ADD COLUMN installer_size_bytes INTEGER,
   ADD COLUMN installer_generated_at TIMESTAMPTZ;
   ```
2. Verificar RLS policies permitem SELECT para admins

### Teste falha no UI: "Integridade verificada não aparece"

**Causa:** Frontend não está calculando SHA256 ou toast está oculto

**Solução:**
1. Verificar que `downloadAndVerifyScript` foi implementado
2. Confirmar que Web Crypto API está disponível (HTTPS/localhost)
3. Aumentar timeout do teste para aguardar cálculo

---

## 🎓 Boas Práticas

### Para Desenvolvedores

1. **Sempre execute testes SHA256 após modificar:**
   - `serve-installer/index.ts`
   - `auto-generate-enrollment/index.ts`
   - `AgentInstaller.tsx` (função `downloadAndVerifyScript`)

2. **Valide manualmente após CI/CD:**
   ```bash
   # Após deploy, teste end-to-end
   npx playwright test e2e/ps1-sha256-validation.spec.ts --project=chromium
   ```

3. **Monitore falhas em produção:**
   - Query `security_logs` para eventos `sha256_mismatch`
   - Alerte time de segurança se detecções aumentarem

### Para QA

1. **Teste matriz de plataformas:**
   - Windows + PowerShell 5.1+
   - Linux + Bash 4.0+
   - Diferentes navegadores (Chrome, Firefox, Safari)

2. **Teste cenários adversos:**
   - Rede lenta (simular com Playwright network throttling)
   - Interrupção de download
   - Múltiplos downloads simultâneos

3. **Valide UX:**
   - Mensagens de erro são claras
   - Toasts aparecem no momento certo
   - Hash é copiável facilmente

---

## 📚 Referências

- **Documentação SHA256:** [`docs/SECURITY_VALIDATION.md`](./docs/SECURITY_VALIDATION.md)
- **Código Backend:** [`supabase/functions/serve-installer/index.ts`](./supabase/functions/serve-installer/index.ts)
- **Código Frontend:** [`src/pages/AgentInstaller.tsx`](./src/pages/AgentInstaller.tsx)
- **Migration:** Colunas `installer_sha256`, `installer_size_bytes`, `installer_generated_at` em `enrollment_keys`

---

## 🤝 Contribuindo

Ao adicionar novos testes SHA256:

1. Siga padrão de nomenclatura: `deve [ação] [resultado esperado]`
2. Use `console.log` para feedback visual durante execução
3. Inclua comentários explicando lógica complexa
4. Valide tanto sucesso quanto falha (positive + negative testing)
5. Atualize esta documentação com novos casos de teste

---

**Última Atualização:** 2025-01-13  
**Autor:** Rafael Costa - Engenharia de Qualidade CyberShield  
**Status:** ✅ Todos os testes implementados e validados
