# CyberShield Testing Suite

Conjunto completo de testes para validação de instalação e testes de carga do CyberShield.

## 📋 Testes Disponíveis

### 1. Windows Installation Test (`windows-installation-test.ps1`)

Valida completamente a instalação e funcionamento de um agent Windows.

**O que testa:**
- ✅ Pré-requisitos (PowerShell, Admin, Network)
- ✅ Processo de Enrollment
- ✅ Heartbeat
- ✅ Job Polling
- ✅ Job Acknowledgment
- ✅ Operação contínua (5 minutos por padrão)
- ✅ Sistema de logs

**Como usar:**

```powershell
# Execute como Administrador
cd tests

.\windows-installation-test.ps1 `
  -ServerUrl "https://seu-server.supabase.co" `
  -EnrollmentKey "sua-chave-de-enrollment" `
  -TestDuration 300
```

**Parâmetros:**
- `ServerUrl` (obrigatório): URL do servidor Supabase
- `EnrollmentKey` (obrigatório): Chave de enrollment válida
- `TestDuration` (opcional): Duração do teste contínuo em segundos (padrão: 300)

**Exemplo de saída:**

```
╔═══════════════════════════════════════════════════════════╗
║     CyberShield Windows Agent Installation Test Suite    ║
╚═══════════════════════════════════════════════════════════╝

=== TESTE 1: Pré-requisitos ===
[✓ PASS] PowerShell 5.1+
[✓ PASS] Administrator Rights
[✓ PASS] Network Connectivity
[✓ PASS] Server Reachable

=== TESTE 2: Processo de Enrollment ===
[✓ PASS] Enrollment Successful
       Agent: test-agent-20251110-160530
       Token: a1b2c3d4e5f6g7h8...
       Secret: x1y2z3a4b5c6d7e8...

[...]

╔═══════════════════════════════════════════════════════════╗
║                     FINAL REPORT                          ║
╚═══════════════════════════════════════════════════════════╝

[✓] Prerequisites
[✓] Enrollment
[✓] Heartbeat
[✓] JobPolling
[✓] JobAck
[✓] ContinuousOperation
[✓] LogsCleanup

Tests Passed: 7 / 7 (100%)

✓ INSTALLATION VALIDATION: PASSED
  Agent is ready for production deployment
```

---

### 2. Load Test (`load-test.ps1`)

Testa a escalabilidade do sistema simulando múltiplos agents e operações simultâneas.

**O que testa:**
- ✅ Enrollment em massa (10+ agents)
- ✅ Heartbeat storm (todos agents simultaneamente)
- ✅ Job polling storm
- ✅ Carga sustentada (60 segundos)
- ✅ Métricas de performance (throughput, latência, taxa de erro)

**Como usar:**

```powershell
# Execute como Administrador
cd tests

.\load-test.ps1 `
  -ServerUrl "https://seu-server.supabase.co" `
  -EnrollmentKey "sua-chave-de-enrollment" `
  -NumAgents 10 `
  -NumJobsPerAgent 10 `
  -ConcurrentRequests 5
```

**Parâmetros:**
- `ServerUrl` (obrigatório): URL do servidor Supabase
- `EnrollmentKey` (obrigatório): Chave de enrollment válida
- `NumAgents` (opcional): Número de agents a criar (padrão: 10)
- `NumJobsPerAgent` (opcional): Número de jobs por agent (padrão: 10)
- `ConcurrentRequests` (opcional): Requisições simultâneas (padrão: 5)

**Exemplo de saída:**

```
╔═══════════════════════════════════════════════════════════╗
║          CyberShield Load Test Suite                     ║
╚═══════════════════════════════════════════════════════════╝

Configuration:
  - Server: https://seu-server.supabase.co
  - Agents: 10
  - Jobs per agent: 10
  - Concurrent requests: 5
  - Total operations: 110

═══ PHASE 1: Agent Enrollment ===

[1/10] Enrolling load-test-agent-1-162530... ✓ OK (245ms)
[2/10] Enrolling load-test-agent-2-162530... ✓ OK (198ms)
[...]

Enrollment Summary:
  - Enrolled: 10 / 10
  - Failed: 0
  - Duration: 2.45s
  - Rate: 4.08 agents/s

[...]

╔═══════════════════════════════════════════════════════════╗
║                   FINAL STATISTICS                        ║
╚═══════════════════════════════════════════════════════════╝

Agents:
  - Enrolled: 10 / 10
  - Failed Enrollments: 0

Requests:
  - Total: 1245
  - Failed: 3
  - Success Rate: 99.76%

Response Times:
  - Average: 187.45ms
  - Min: 45ms
  - Max: 987ms
  - P95: 432ms

Performance:
  - Total Duration: 72.3s
  - Average Throughput: 17.22 req/s

✓ LOAD TEST: PASSED
  System is ready for production scale
```

---

## 📊 Interpretação dos Resultados

### Windows Installation Test

**PASSED (✓):**
- Todos os testes passaram
- Agent está pronto para produção
- Pode prosseguir com deployment

**FAILED (✗):**
- Um ou mais testes falharam
- Revisar os testes com falha
- Corrigir problemas antes de deployment

### Load Test

**Métricas de Sucesso:**
- **Success Rate**: ≥ 95% (ideal: > 99%)
- **Average Response Time**: < 2000ms (ideal: < 500ms)
- **P95 Response Time**: < 3000ms (ideal: < 1000ms)
- **Throughput**: > 10 req/s (depende do hardware)

**PASSED (✓):**
- Success rate ≥ 95%
- Response time médio < 2s
- 90%+ dos agents enrollados

**NEEDS IMPROVEMENT (⚠):**
- Success rate < 95%
- Response time médio > 2s
- Muitos agents falharam no enrollment

---

## 🔧 Troubleshooting

### Teste falha no Prerequisites

**Problema**: PowerShell version < 5.1
```powershell
# Atualizar PowerShell:
# Baixe e instale PowerShell 7+
# https://github.com/PowerShell/PowerShell/releases
```

**Problema**: Não é Administrator
```powershell
# Execute como Administrador:
# Botão direito no PowerShell → "Executar como administrador"
```

**Problema**: Server não acessível
```bash
# Teste conectividade:
Test-Connection -ComputerName seu-server.supabase.co
nslookup seu-server.supabase.co
```

### Teste falha no Enrollment

**Problema**: "Invalid enrollment key"
- Verifique se a chave está correta e não expirou
- Gere uma nova chave no dashboard: Admin → Enrollment Keys

**Problema**: "Rate limit exceeded"
- Aguarde alguns minutos
- Ajuste rate limit no código se necessário

### Load Test com baixo throughput

**Causas comuns:**
1. **Rede lenta**: Teste em ambiente com boa conectividade
2. **Rate limiting**: Ajuste limites no backend se necessário
3. **Hardware limitado**: Execute em máquina mais potente

**Soluções:**
- Reduzir `NumAgents` e `NumJobsPerAgent`
- Aumentar delays entre requisições
- Distribuir teste em múltiplas máquinas

---

## 📝 Logs e Debugging

### Ver logs detalhados

**Windows Installation Test:**
- Logs aparecem no console em tempo real
- Logs também salvos em `C:\CyberShield\logs\agent.log` (se agent foi instalado)

**Load Test:**
- Todos os resultados aparecem no console
- Para debug adicional, adicione `-Verbose` ao comando

### Capturar logs para análise

```powershell
# Salvar output completo em arquivo:
.\windows-installation-test.ps1 `
  -ServerUrl "https://seu-server.supabase.co" `
  -EnrollmentKey "sua-chave" `
  | Tee-Object -FilePath "test-results.txt"

# Ou com redirecionamento:
.\load-test.ps1 [...] > load-test-results.txt 2>&1
```

---

## 🎯 Melhores Práticas

### Antes de executar testes

1. **Gere uma chave de enrollment válida**
   - Dashboard → Admin → Enrollment Keys → New Key
   - Configure expiração adequada (ex: 1 hora)
   - Max uses: ilimitado para testes de carga

2. **Verifique quota de agents**
   - Dashboard → Admin → Tenant Features
   - Aumente max_agents se necessário

3. **Prepare o ambiente**
   - Máquina com boa conectividade
   - PowerShell 5.1+ instalado
   - Permissões de Administrator

### Após executar testes

1. **Limpe agents de teste**
   - Dashboard → Agents
   - Delete agents com prefixo `test-agent-` ou `load-test-agent-`

2. **Revogue chave de enrollment**
   - Dashboard → Admin → Enrollment Keys
   - Revogue a chave usada nos testes

3. **Analise logs do backend**
   - Backend → Functions → Logs
   - Verifique erros durante os testes
   - Identifique gargalos

---

## 📈 Benchmarks Esperados

### Hardware Médio (8GB RAM, 4 cores)

**Windows Installation Test:**
- Duration: ~6 minutos (300s de teste contínuo)
- Success Rate: > 98%
- Average Response Time: < 300ms

**Load Test (10 agents):**
- Total Duration: ~75 segundos
- Success Rate: > 99%
- Average Response Time: < 200ms
- Throughput: > 15 req/s

### Hardware Potente (16GB+ RAM, 8+ cores)

**Load Test (50 agents):**
- Total Duration: ~3 minutos
- Success Rate: > 99%
- Average Response Time: < 150ms
- Throughput: > 30 req/s

### Limites Conhecidos

- **Rate Limiting**: 60 req/min por agent (ajustável)
- **Supabase Free Tier**: Limitações de throughput
- **Network**: Latência varia conforme localização

---

## 🆘 Suporte

Se os testes falharem consistentemente:

1. Verifique `TROUBLESHOOTING_GUIDE.md`
2. Revise logs do backend (Functions logs)
3. Teste conectividade manualmente
4. Ajuste parâmetros dos testes
5. Entre em contato com suporte incluindo:
   - Output completo dos testes
   - Logs do backend
   - Configuração do ambiente

---

**Última atualização**: 2025-11-10  
**Versão**: 2.0.0
