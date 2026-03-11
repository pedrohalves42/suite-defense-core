# CyberShield — Visão Técnica Completa

> **Versão**: 5.0.14 | **Atualizado**: 2026-03-11  
> **Classificação**: Comercial / Técnico  
> **Audiência**: Engenheiros de Segurança, CTOs, MSPs, Auditores

---

## 1. O Que É o CyberShield

CyberShield é uma **plataforma de Security Compliance autônoma** para PMEs brasileiras (clínicas, escritórios de advocacia, contabilidades, MSPs). Combina **proteção de endpoint**, **conformidade LGPD automatizada** e **provas forenses irrefutáveis** em uma única solução SaaS multi-tenant.

### Proposta de Valor em Uma Frase

> **"Protege e Prova"** — não apenas detecta e remedia ameaças, mas gera evidências criptográficas com valor jurídico de que as políticas de segurança foram aplicadas.

---

## 2. Arquitetura do Sistema

### 2.1 Visão Geral

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DASHBOARD SaaS (React/Vite)                   │
│  Multi-tenant │ RBAC │ Realtime │ i18n (PT/EN/ES)                    │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HTTPS + JWT
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     EDGE FUNCTIONS (Deno/TypeScript)                 │
│  heartbeat │ poll-jobs │ enroll-agent │ action-center │ SOAR engine  │
│  threat-intel │ update-user-role │ generate-enrollment-key           │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HMAC-SHA256 + Ed25519
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     AGENTES (Endpoints)                              │
│  Windows (PowerShell) │ Linux (Bash/systemd) │ macOS (Bash/launchd)  │
│  FSM 6 estados │ Auto-remediação │ Telemetria │ Prova digital        │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Arquitetura Hexagonal

O backend segue **Hexagonal Architecture** com 6 Bounded Contexts:

| Contexto | Responsabilidade |
|----------|-----------------|
| **Agent Management** | Lifecycle, enrollment, heartbeat, FSM |
| **Job Orchestration** | Criação, polling, execução, blast radius |
| **Security & Compliance** | Scores, vulnerabilidades, file integrity, SOAR |
| **Update System** | Releases, Ed25519 signatures, rollback |
| **Tenant & Isolation** | Multi-tenancy, RLS, RBAC |
| **Telemetry & Diagnostics** | Métricas HW, processos, rede, certificados |

**Separação clara**: Domain Entities e Use Cases não dependem de infraestrutura. Ports/Adapters (CryptoPort, AgentRepository) isolam Supabase, crypto e I/O.

### 2.3 Stack Tecnológico

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion |
| **State** | TanStack Query (React Query v5), Zustand |
| **Backend** | Supabase (PostgreSQL 15+, Edge Functions Deno, Realtime, Storage) |
| **Agente Windows** | PowerShell 5.1+ nativo (zero dependências) |
| **Agente Linux/macOS** | Bash puro (zero dependências, systemd/launchd) |
| **Criptografia** | Ed25519 (assinaturas), HMAC-SHA256 (autenticação), SHA-256 (hashing) |
| **Relatórios** | jsPDF + jspdf-autotable (PDF nativo no browser) |

---

## 3. Agente — Motor de Segurança

### 3.1 Finite State Machine (FSM) — 6 Estados

```
INITIALIZING → AUTHENTICATING → SYNCING → ENFORCING
                                              ↓
                                          DEGRADED → SAFE_MODE
```

| Estado | Comportamento |
|--------|--------------|
| `INITIALIZING` | Carrega config, valida integridade do script |
| `AUTHENTICATING` | Autentica via HMAC + token hash |
| `SYNCING` | Sincroniza jobs, policies, threat indicators |
| `ENFORCING` | Executa remediações, coleta telemetria, envia heartbeats |
| `DEGRADED` | Falhas parciais — opera com capacidades reduzidas |
| `SAFE_MODE` | Falhas críticas — apenas heartbeat e logs |

### 3.2 Capacidades do Agente (v5.0.13+)

#### Telemetria Completa
- **Hardware**: CPU (uso, cores, temperatura), RAM (uso/total), Disco (por volume, SMART)
- **Processos**: Snapshot completo com PID, CPU%, MEM%, path, assinatura digital
- **Rede**: Adapters, portas abertas, conexões ativas, DNS queries
- **Certificados**: Store LocalMachine + CurrentUser, validade, self-signed detection
- **Backup**: Windows Backup, VSS Snapshots, Veeam, Cloud Sync status

#### Segurança Ativa
- **Antivírus**: Status, definições, última varredura (via WMI/SecurityCenter2)
- **Firewall**: Perfis Domain/Private/Public, regras ativas
- **Windows Update**: Patches pendentes, histórico de instalação
- **USB Devices**: Detecção, classificação (storage/HID/network), bloqueio por policy
- **File Integrity Monitoring (FIM)**: Hash SHA-256 de arquivos críticos do sistema
- **Vulnerability Scanning**: CVE matching local contra base de threat intelligence

#### Remediação Autônoma (SOAR)
- Reativar Windows Defender se desabilitado
- Reativar Firewall por perfil
- Forçar atualização de definições AV
- Instalar patches críticos pendentes
- Bloquear dispositivos USB não autorizados
- Quarentenar processos suspeitos
- Isolamento de rede (kill switch) em caso de ransomware

#### EDR Capabilities
- **Process Lineage**: Rastreamento de parent→child via CIM/Win32_Process
- **Ransomware Detection**: Monitoramento de I/O anômalo, entropia de arquivos, canary files
- **Data Exposure Detection**: Scan de PII/CPFs em locais não protegidos

### 3.3 Paridade Multi-Plataforma

| Capability | Windows (PS) | Linux (Bash) | macOS (Bash) |
|-----------|:---:|:---:|:---:|
| FSM 6 estados | ✅ | ✅ | ✅ |
| HMAC + Ed25519 | ✅ | ✅ | ✅ |
| Heartbeat/Telemetria | ✅ | ✅ | ✅ |
| Auto-remediação | ✅ | ✅ | ✅ |
| FIM | ✅ | ✅ | ✅ |
| DNS Filter | ✅ | ✅ | ✅ |
| USB Control | ✅ | ✅ | ✅ |
| Process Lineage EDR | ✅ | 🔜 | 🔜 |
| Ransomware Detection | ✅ | 🔜 | 🔜 |
| **Dependências externas** | **0** | **0** | **0** |

> **Zero dependências** — os agentes usam apenas recursos nativos do SO (PowerShell 5.1 / Bash 4+).

---

## 4. Segurança — Zero Trust Architecture

### 4.1 Invariantes de Segurança (Mandatórios)

| ID | Invariante | Mecanismo |
|----|-----------|-----------|
| **INV-001** | Isolamento absoluto entre tenants | RLS em TODAS as tabelas, `current_user_tenant_id()` |
| **INV-002** | Autenticidade e integridade | HMAC-SHA256 (agent↔server), JWT (user↔server) |
| **INV-003** | Secrets nunca expostos | Hash-only storage, views `_safe`, audit masking |
| **INV-004** | Nenhuma chave em texto simples | SHA-256 para tokens e enrollment keys |
| **INV-005** | Auditoria imutável | Triggers de bloqueio UPDATE/DELETE, hash chain |
| **INV-006** | Escalada de privilégio impossível | Roles em tabela separada, SECURITY DEFINER RPCs |

### 4.2 Autenticação Agente↔Servidor

```
Agente                              Edge Function
  │                                       │
  │  POST /heartbeat                      │
  │  Headers:                             │
  │    x-agent-id: <uuid>                 │
  │    x-timestamp: <ISO8601>             │
  │    x-nonce: <random>                  │
  │    x-signature: HMAC-SHA256(          │
  │      timestamp:nonce:body,            │
  │      hmac_secret                      │
  │    )                                  │
  │    x-auth-token: SHA256(token)        │
  │ ─────────────────────────────────────►│
  │                                       │ 1. Validate timestamp ±5min
  │                                       │ 2. Check nonce uniqueness (anti-replay)
  │                                       │ 3. Verify HMAC signature
  │                                       │ 4. Match token hash
  │                                       │ 5. Validate tenant isolation
  │                     200 OK            │
  │ ◄─────────────────────────────────────│
```

**HMAC mandatório** para agentes v5.0.12+. Agentes legados (token-only) são rejeitados.

### 4.3 Supply Chain — Zero Trust

Cada release de script de agente é assinado com **Ed25519**:

1. Build pipeline gera script + assina com chave privada
2. Assinatura armazenada em `agent_releases.signature_base64`
3. Agente baixa script + assinatura
4. **Verificação mandatória** antes de execução (proteção TOCTOU)
5. Falha de verificação = **terminação imediata**

### 4.4 Cadeia de Custódia Criptográfica

Cada ação executada pelo agente gera um **evidence log assinado**:

```
Evidence[n] = {
  action: "firewall_remediated",
  timestamp: "2026-03-11T14:30:00Z",
  agent_id: "abc-123",
  hash: SHA256(Evidence[n-1].hash + action + timestamp),
  signature: Ed25519(hash, agent_key)
}
```

→ **Mini-blockchain por endpoint** = prova forense com valor jurídico.  
→ Qualquer adulteração quebra a cadeia = detectável instantaneamente.

### 4.5 Multi-Tenancy & RBAC

| Camada | Mecanismo |
|--------|-----------|
| **Database** | RLS policies em TODAS as tabelas com `tenant_id` |
| **Views** | `security_invoker=on`, `security_barrier=true` |
| **RPCs** | SECURITY DEFINER com validação explícita de tenant |
| **Frontend** | `useActiveTenant()` hook, role-aware permissions |
| **Edge Functions** | JWT claim validation + tenant_id cross-check |

**Roles**: `super_admin` > `admin` > `operator` > `viewer`  
**Princípio**: Role é avaliada **por tenant ativo**, não globalmente.

---

## 5. Compliance Engine

### 5.1 Security Score (0-100)

Calculado por pesos:

| Categoria | Peso | O que mede |
|-----------|:----:|-----------|
| Vulnerabilities | 25% | CVEs pendentes, patches atrasados |
| File Integrity | 20% | Hashes de arquivos críticos alterados |
| Endpoint Protection | 20% | AV ativo, definições atualizadas, firewall |
| Certificates | 15% | Certificados expirados/self-signed |
| Access Control | 10% | MFA, policies de senha |
| Network | 10% | Portas expostas, conexões suspeitas |

### 5.2 Drift Detector

Monitora degradação de postura com alertas automáticos:

| Desvio | Ação |
|--------|------|
| **-5 pontos** | ⚠️ Alerta informativo |
| **-10 pontos** | 🟡 Alerta médio + recomendação |
| **-15 pontos** | 🔴 Alerta crítico + SOAR trigger |

### 5.3 Relatórios LGPD (PDF Automatizado)

Geração mensal de relatórios com:
- Score de conformidade visual
- Infraestrutura monitorada (agentes, endpoints, OS)
- Vulnerabilidades detectadas e remediadas
- Status de backups
- Eventos de segurança dos últimos 6 meses
- **Prova documental para ANPD** (Autoridade Nacional de Proteção de Dados)

### 5.4 Frameworks Suportados

| Framework | Cobertura |
|-----------|----------|
| **LGPD** | Compliance automatizado com provas |
| **ISO 27001** | Evidências de controles (Annex A) |
| **NIST CSF** | Identify, Protect, Detect, Respond, Recover |
| **SOC 2** | Type II evidence matrix |
| **GDPR** | DPIA/RIPD, ROPA, consentimento |

---

## 6. Threat Intelligence

### 6.1 Pipeline de Ingestão

```
MalwareBazaar ──┐
URLhaus ────────┤──► sync-threat-feeds (Edge Function)
Feodo Tracker ──┘          │
                           ▼
                   threat_indicators (DB)
                           │
                           ▼ matching engine
                   threat_matches ──► SOAR trigger
                                      (isolamento automático)
```

### 6.2 CyberShield Threat Network

Compartilhamento global de IoCs entre tenants:
- Detecção em São Paulo → bloqueio automático na Cidade do México
- IoCs anonimizados (sem dados de tenant)
- Participação opt-in por tenant

---

## 7. SOAR Engine (Security Orchestration, Automation & Response)

### 7.1 Playbooks Automatizados

| Trigger | Ação Automática |
|---------|----------------|
| AV desabilitado | Reativar + alerta |
| Firewall desligado | Reativar perfil + log |
| Ransomware detectado | Isolamento de rede + alerta crítico |
| USB não autorizado | Bloqueio + evidence log |
| Threat Intel match | Isolamento + quarentena + alerta |
| Patch crítico pendente >7d | Forçar instalação |
| Certificado expirando <30d | Alerta + recomendação |

### 7.2 Blast Radius Adaptativo

Controla o impacto de ações automáticas com base no horário:

| Horário | Max % da frota afetada |
|---------|:----------------------:|
| Horário comercial | 10% |
| Fora do horário | 30% |
| Manutenção programada | 100% |

---

## 8. Dashboard — Funcionalidades

| Módulo | Descrição |
|--------|-----------|
| **Overview** | KPIs, security score, agent health, alertas recentes |
| **Agents** | Lista, status, detalhes, heartbeat history, telemetria |
| **Jobs** | Criação, monitoramento, resultados, blast radius |
| **Compliance** | Score por categoria, drift, evidências, relatórios PDF |
| **Threat Intel** | IoCs ativos, fontes, matches na frota |
| **Action Center** | Feed de ações recomendadas com prioridade |
| **Members** | RBAC, convites, roles por tenant |
| **Settings** | Policies, enrollment keys, API keys, automações |
| **Reports** | Relatórios LGPD mensais automatizados |

### Recursos de UX
- **Realtime**: Atualizações via WebSocket (Supabase Realtime)
- **i18n**: PT-BR, EN, ES
- **Dark/Light mode**: Tema completo
- **Responsive**: Desktop + tablet
- **PWA-ready**: Service worker para offline básico

---

## 9. Diferencial Competitivo vs Concorrência

| Recurso | CyberShield | NinjaOne | Atera | Acronis | Bitdefender |
|---------|:-----------:|:--------:|:-----:|:-------:|:-----------:|
| Endpoint monitoring | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auto-remediação (SOAR) | ✅ | ❌ | ❌ | Parcial | ❌ |
| Prova forense criptográfica | ✅ | ❌ | ❌ | ❌ | ❌ |
| Compliance LGPD nativo | ✅ | ❌ | ❌ | ❌ | ❌ |
| Relatórios para ANPD | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-tenant nativo | ✅ | ✅ | ✅ | ✅ | Parcial |
| Hash chain (blockchain) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ed25519 supply chain | ✅ | ❌ | ❌ | ❌ | ❌ |
| Threat Network compartilhada | ✅ | ❌ | ❌ | ❌ | ❌ |
| Zero dependências no agente | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ransomware detection | ✅ | ❌ | ❌ | ✅ | ✅ |
| USB control | ✅ | ❌ | ❌ | ❌ | ✅ |
| FIM (File Integrity) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Foco em PMEs LATAM | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Preço acessível para PMEs** | ✅ | ❌ | Parcial | ❌ | ❌ |

### Diferenciadores Únicos

1. **Prova Digital Irrefutável**: Cadeia de custódia criptográfica (Ed25519 + hash chain) que serve como evidência jurídica em auditorias e fiscalizações da ANPD. Nenhum concorrente oferece isso.

2. **Zero Dependências**: Agentes em PowerShell/Bash puros — sem Python, sem Go, sem .NET Runtime. Instala em segundos, roda em qualquer máquina.

3. **LGPD-First**: Construído para conformidade brasileira desde o dia 1. Relatórios prontos para ANPD, DPIA automatizado, registro de consentimento.

4. **Threat Network Compartilhada**: Inteligência de ameaças coletiva entre todos os tenants — um ataque detectado em um cliente protege todos os outros em tempo real.

5. **SOAR Nativo para PMEs**: Automação de resposta a incidentes que antes só existia em ferramentas enterprise de $100k+/ano.

---

## 10. Dados Técnicos de Performance

| Métrica | Target | Mecanismo |
|---------|--------|-----------|
| Heartbeat interval | 5 min | Configurable per policy |
| Edge Function latency p95 | < 150ms | Deno cold start optimization |
| Agent memory footprint | < 50MB | PowerShell process |
| Script startup time | < 3s | O(1) lookups, cached config |
| Max Base64 payload | 7MB | Memory protection limit |
| Log rotation | 5MB max | Auto-rotate on threshold |
| Nonce TTL (anti-replay) | 10 min | `hmac_signatures` table |
| Session timeout (admin) | 15 min | Server-side validation |
| Session timeout (viewer) | 60 min | Server-side validation |

---

## 11. Modelo de Dados (Tabelas Principais)

| Tabela | Propósito |
|--------|----------|
| `agents` | Registro de endpoints, status, HMAC secret |
| `agent_evidence_logs` | Logs forenses com hash chain |
| `agent_execution_chain` | Mini-blockchain por agente |
| `agent_file_integrity` | Resultados de FIM |
| `agent_certificates` | Inventário de certificados |
| `agent_behavioral_baseline` | Baselines estatísticos para anomaly detection |
| `jobs` / `job_results` | Orchestração de tarefas remotas |
| `threat_indicators` | IoCs de feeds globais |
| `threat_matches` | Detecções na frota |
| `audit_logs` | Auditoria imutável de ações |
| `security_logs` | Eventos de segurança |
| `user_roles` | RBAC segregado (nunca em `profiles`) |
| `enrollment_keys` | Hash-only, one-time use |
| `agent_releases` | Releases com assinatura Ed25519 |
| `compliance_scores` | Scores históricos por tenant |
| `automation_rules` | Configuração de playbooks SOAR |

---

## 12. Roadmap Executado

| Fase | Status | Entregas |
|------|:------:|---------|
| **Fase 1 — Higiene** | ✅ 100% | Auto-remediação, Patch Management, Security Score, Relatórios LGPD |
| **Fase 2 — Visibilidade** | ✅ 100% | Ransomware Detection, Data Exposure, Backup Monitoring |
| **Fase 3 — Defesa Ativa** | ✅ 100% | SOAR avançado, Threat Intel Network, Process Lineage EDR |

---

## 13. Contato

- **Email**: gamehousetecnologia@gmail.com  
- **Emergências**: (34) 98443-2835  
- **Vulnerabilidades**: gamehousetecnologia@gmail.com  

---

*Este documento é propriedade da CyberShield e deve ser tratado como material comercial-técnico.*
