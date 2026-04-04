
# Análise de Paridade: Unix/macOS vs Windows

## ✅ Já implementado e em paridade (NÃO precisa de mudança)

| Capacidade | Windows | Linux | macOS |
|---|---|---|---|
| FSM (6 estados) | ✅ | ✅ | ✅ |
| HMAC Auth (timing-safe) | ✅ | ✅ | ✅ |
| Hash Chain (integridade de execução) | ✅ | ✅ | ✅ |
| TOCTOU 3-strikes + self-heal | ✅ | ✅ | ✅ |
| Heartbeat + force_hash_resync | ✅ | ✅ | ✅ |
| Job polling + dispatch whitelist | ✅ | ✅ | ✅ |
| Process baseline + anomaly detection | ✅ | ✅ | ✅ |
| System metrics (CPU/RAM/Disk) | ✅ | ✅ | ✅ |
| Kill process (com proteção) | ✅ | ✅ | ✅ |
| Stop/Restart service | ✅ | ✅ | ✅ |
| DNS Filter (block/remove) | ✅ | ✅ | ✅ |
| Network diagnostics | ✅ | ✅ | ❌ |
| Service health check | ✅ | ✅ | ❌ |
| Disable service | ✅ | ✅ | ❌ |
| Software inventory | ✅ | ✅ | ✅ |
| Vuln scan (leve) | ✅ | ✅ | ✅ |
| Auto-repair (disco/CPU) | ✅ | ✅ | ✅ |
| Security events (MITRE ATT&CK) | ✅ | ✅ | ✅ |
| Adaptive sleep | ✅ | ✅ | ✅ |
| Log buffering | ✅ | ✅ | ✅ |

## 🔴 Lacunas reais (existem no Windows, faltam no Unix)

### 1. Disk Metrics por drive/volume (Baixo impacto)
- **Windows**: Coleta métricas por drive (C:, D:, etc.) → tabela `agent_disk_metrics`
- **Linux/macOS**: Apenas disco raiz via `df /`
- **Custo**: Baixo (sem nova tabela, insert no heartbeat)

### 2. Certificados instalados (Médio impacto)
- **Windows**: Coleta certificados de cert stores → tabela `agent_certificates`
- **Linux**: `/etc/ssl/certs`, `/usr/local/share/ca-certificates`
- **macOS**: `security find-certificate -a`
- **Custo**: Médio (job handler + insert)

### 3. Event Log collection (Baixo impacto)
- **Windows**: EventLog (System, Security, Application)
- **Linux**: journald / syslog
- **macOS**: `log show`
- **Relevância**: O heartbeat já envia `enable_eventlog: true` — os agentes Unix não processam

### 4. Job types faltantes no macOS
- `network_diagnostics` (ping targets)
- `service_health_check` (launchctl status)
- `disable_service` (launchctl bootout)

### 5. Skip Firewall Remediation flag
- **Windows**: Processa `skip_firewall_remediation` do heartbeat
- **Unix**: Ignora este campo

## 📊 Recomendação prática (custo vs valor)

### Implementar agora (alto valor, baixo custo):
1. **macOS: 3 job handlers faltantes** — ~30 linhas de código
2. **Skip firewall flag no heartbeat Unix** — ~5 linhas

### Implementar depois (médio valor):
3. **Disk metrics por volume** — precisa de lógica de parsing multivolume
4. **Certificados** — handler de coleta + insert

### Não implementar (baixo valor, alto custo):
5. **Event Log** — volume alto de dados, custo de IOPS significativo para 4 agentes

## Quer que eu implemente as lacunas de alto valor agora (itens 1 e 2)?
