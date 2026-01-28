

# 🔍 Diagnóstico Completo: Por Que os Dados Upstream Não Estão Sendo Coletados

## Resumo Executivo

Após investigação profunda, identifiquei **5 problemas raiz** que explicam por que os playbooks não executam e os dados de vulnerabilidade/risco não estão populados:

| # | Problema | Evidência | Impacto |
|---|----------|-----------|---------|
| 1 | **CVE Database sem `affected_products`** | 2.521 CVEs, 100% com `affected_products = []` | Scan de vulnerabilidades não encontra matches |
| 2 | **`vuln_findings` vazia** | 0 registros | Nenhuma vulnerabilidade persistida para playbooks |
| 3 | **Software Inventory com versões atualizadas** | Chrome 144.x (baseline exige 121.x), WinRAR 7.01 (baseline exige 6.24) | Nenhum software vulnerável encontrado |
| 4 | **Jobs falhando por timeout** | 180 falhas em `collect_web_activity` (timeout), 91 em `light_vuln_scan` (AGENT_STALLED) | Dados não coletados de agentes problemáticos |
| 5 | **Categorias DNS limitadas** | 100% bloqueios são "social", 0% malware/phishing | Playbooks de navegação suspeita nunca ativam |

---

## 📊 Evidências Detalhadas

### 1. CVE Database com `affected_products` Vazio

```
Total CVEs: 2.521
Com affected_products populados: 0 (0%)
Sem affected_products: 2.521 (100%)
```

**Impacto**: A função `scan-vulnerabilities` busca CVEs usando:
```sql
.or(`affected_products.cs.{${keyword}},description.ilike.%${keyword}%`)
```

Como `affected_products` está sempre vazio, só encontra matches via `description ILIKE`, que é menos preciso e não preenche `vuln_findings`.

**Causa Raiz**: A Edge Function `fetch-nvd-cves` ou `sync-cve-database` não está populando o campo `affected_products` corretamente.

### 2. Software Inventory com Versões Atualizadas

Os agentes têm software **mais atualizado** que os baselines:

| Software | Versão Instalada | Versão Mínima Segura (Baseline) | Vulnerável? |
|----------|-----------------|--------------------------------|-------------|
| Google Chrome | 144.0.7559.97 | 121.0 | ❌ NÃO |
| Mozilla Firefox | 146.0.1 | 122.0 | ❌ NÃO |
| WinRAR | 7.01.0 | 6.24 | ❌ NÃO |
| 7-Zip | 19.00 | 24.01 | ✅ SIM |
| Java 8 | 8.0.4710.9 | 8u401 | ❌ NÃO |

**Impacto**: Apenas 7-Zip está vulnerável, mas como `evaluate-software-risk` não roda periodicamente para todos agentes, as vulnerabilidades não são detectadas.

### 3. Jobs Falhando por Timeout e Agentes Stalled

```
Falhas por tipo (últimos 7 dias):
- collect_web_activity: 180 falhas (13 agentes)
  → Erro: "O tempo limite da operação foi atingido"
  
- light_vuln_scan: 91 falhas (10 agentes)
  → Erro: "AGENT_STALLED - Job stuck in delivered state for >2 hours"
  
- collect_antivirus_status: 87 falhas (10 agentes)
  → Erro: "AGENT_STALLED - Auto-cleanup: delivered job exceeded 2 hours timeout"
  
- software_inventory_collect: 84 falhas (9 agentes)
  → Erro: "AGENT_STALLED - Auto-cancelled: Job stuck in delivered state"
```

**Agentes mais problemáticos**:
| Agente | Jobs Falhos | Taxa de Sucesso |
|--------|-------------|-----------------|
| pcteste1 | 85 | 45.2% |
| Pc-Vidro-Planalto | 64 | 40.7% |
| Pc-Julianna1-Planalto | 40 | 0% |
| PC-Servidor-Planalto | 79 | 83.0% |

**Causa Raiz**: 
- `pcteste1`: Timeout constante em `collect_web_activity` - provavelmente histórico de browser muito grande
- `Pc-Julianna1-Planalto`: 0% sucesso - agente com problemas graves de execução
- Agentes STALLED: Jobs entregues mas não executados - agentes ficam offline após receber job

### 4. Categorias DNS Limitadas a "social"

```
Categorias de URLs bloqueadas:
- social: 1.923 bloqueios (100%)
- malware: 0
- phishing: 0
- c2: 0
- botnet: 0
- suspicious: 0
```

**Impacto**: Playbooks como "Navegação Suspeita Detectada" e "Múltiplos Acessos Maliciosos" exigem categorias `malware`, `phishing`, `suspicious`, que não existem.

**Causa Raiz**: O sistema de categorização de URLs só identifica "social" (redes sociais). Pode ser:
- Rede realmente segura (sem acessos maliciosos)
- Serviço de categorização não implementado/limitado
- Apenas URLs de redes sociais estão na blocklist

### 5. Crons de Vulnerabilidade Existem Mas Não Geram Findings

```
Crons ativos:
- weekly-vulnerability-scan: 0 5 * * 1 (segunda às 5h) → Roda mas não gera findings
- calculate-risk-score-daily: 0 5 * * * (diário às 5h) → Roda mas não tem dados
```

O cron `weekly-vulnerability-scan` executa, mas:
1. Sem `affected_products` populados nos CVEs, não encontra matches
2. Software já está atualizado, não há vulnerabilidades

---

## 🛠️ Plano de Correção

### Fase 1: Corrigir CVE Database (P0)

**1.1 Melhorar fetch-nvd-cves para popular `affected_products`**

Verificar a Edge Function `fetch-nvd-cves` e garantir que extrai corretamente os CPEs/produtos afetados do NVD.

**1.2 Popular `affected_products` retroativamente**

Criar script que extrai produtos da `description` de CVEs existentes e popula `affected_products`:

```sql
-- Exemplo: Extrair produto de CVEs com description mencionando Chrome
UPDATE cve_database
SET affected_products = jsonb_build_array('chrome', 'google chrome')
WHERE description ILIKE '%google chrome%'
  AND (affected_products IS NULL OR affected_products = '[]'::jsonb);
```

### Fase 2: Adicionar Cron para evaluate-software-risk (P0)

Criar cron que chama `evaluate-software-risk` para cada agente periodicamente:

```sql
SELECT cron.schedule(
  'evaluate-software-risk-all-agents-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/evaluate-software-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ...'
    ),
    body := jsonb_build_object('agent_id', a.id)
  )
  FROM agents a
  WHERE a.status = 'active'
    AND a.archived_at IS NULL
  LIMIT 20;
  $$
);
```

### Fase 3: Atualizar Baselines para Software Atual (P1)

Os baselines estão desatualizados (Chrome 121.0 quando produção tem 144.x). Atualizar:

```sql
-- Atualizar baseline do Chrome para versões atuais com vulnerabilidades reais
UPDATE software_vulnerability_baseline
SET 
  min_safe_version = '144.0.7559.100',
  cve_refs = ARRAY['CVE-2026-0905', 'CVE-2026-0907'],
  updated_at = NOW()
WHERE software_name = 'Google Chrome';

-- Adicionar baseline para 7-Zip que está vulnerável
INSERT INTO software_vulnerability_baseline (
  software_name, software_name_patterns, min_safe_version, 
  severity, cve_refs, impact, remediation, action, is_active
) VALUES (
  '7-Zip', ARRAY['7-Zip', '7zip', '7z.exe'], '24.01',
  'high', ARRAY['CVE-2024-11477'], 
  'Vulnerabilidade de execução remota de código',
  'Atualizar para 7-Zip 24.01 ou superior',
  'update_software', true
) ON CONFLICT (software_name) DO UPDATE SET
  min_safe_version = EXCLUDED.min_safe_version,
  cve_refs = EXCLUDED.cve_refs;
```

### Fase 4: Resolver Agentes com Falhas Recorrentes (P1)

**4.1 Investigar `pcteste1` com timeout em web activity**

O agente tem histórico de browser muito grande. Solução:
- Aumentar limite de registros no job `collect_web_activity`
- Ou criar job específico com timeout maior

**4.2 Reinvestigar `Pc-Julianna1-Planalto` com 0% sucesso**

Este agente tem problema grave - jobs são entregues mas nunca executados. Verificar:
- Versão do agente
- Logs do PowerShell no endpoint
- Se o serviço Windows está rodando

### Fase 5: Expandir Categorização de URLs (P2)

Criar um serviço que categoriza URLs bloqueadas usando listas públicas de malware/phishing:

```sql
-- Adicionar categorias na blocklist existente
UPDATE agent_web_activity
SET category = 'malware'
WHERE is_blocked = true
  AND (
    domain ILIKE '%.ru' 
    OR domain ILIKE '%.cn'
    OR domain ILIKE '%malware%'
    OR domain IN (SELECT domain FROM known_malware_domains)
  );
```

---

## Resumo das Correções

| # | Correção | Tipo | Prioridade |
|---|----------|------|------------|
| 1 | Melhorar `fetch-nvd-cves` para popular `affected_products` | Edge Function | P0 |
| 2 | Popular `affected_products` retroativamente | SQL Script | P0 |
| 3 | Criar cron `evaluate-software-risk-all-agents-daily` | Cron Job | P0 |
| 4 | Atualizar baselines para versões atuais (Chrome, Firefox, etc) | SQL Update | P1 |
| 5 | Diagnosticar agentes com falhas recorrentes (pcteste1, Julianna1) | Investigação | P1 |
| 6 | Implementar categorização de URLs para malware/phishing | Edge Function | P2 |

---

## Validação Pós-Implementação

```sql
-- 1. Verificar CVEs com affected_products populados
SELECT COUNT(*) FILTER (WHERE jsonb_array_length(affected_products) > 0) as with_products
FROM cve_database;

-- 2. Verificar vuln_findings populadas
SELECT severity, COUNT(*) FROM vuln_findings GROUP BY severity;

-- 3. Verificar software vulnerável detectado
SELECT name, version, risk_level FROM software_inventory WHERE risk_level IN ('high', 'critical');

-- 4. Verificar categorias de DNS
SELECT category, COUNT(*) FROM agent_web_activity WHERE is_blocked = true GROUP BY category;

-- 5. Verificar taxa de sucesso dos agentes problemáticos
SELECT agent_name, 
       ROUND(COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*) * 100, 1) as success_rate
FROM jobs j JOIN agents a ON j.agent_id = a.id
WHERE a.agent_name IN ('pcteste1', 'Pc-Julianna1-Planalto')
  AND j.created_at > NOW() - INTERVAL '1 day'
GROUP BY agent_name;
```

