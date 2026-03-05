# Política de Trabalho Remoto e Acesso Remoto

| Campo | Valor |
|-------|-------|
| **Código** | RWP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Security Officer |
| **Data Efetiva** | 2026-03-05 |
| **Revisão** | 2027-03-05 |
| **Critério SOC 2** | CC6.1, CC6.6, CC6.7 |

---

## 1. Objetivo

Definir controles de segurança para acesso remoto aos sistemas do CyberShield, garantindo que o trabalho fora do ambiente corporativo mantenha os mesmos padrões de proteção de dados e conformidade SOC 2.

---

## 2. Escopo

Esta política se aplica a:
- Funcionários e colaboradores em trabalho remoto
- Contratados com acesso ao sistema
- Acesso via VPN, SSH ou ferramentas web
- Dispositivos pessoais (BYOD) e corporativos
- Acesso administrativo ao painel CyberShield

---

## 3. Requisitos de Dispositivo

### 3.1 Dispositivos Corporativos

| Controle | Requisito |
|----------|-----------|
| Sistema operacional | Versão suportada com patches atualizados |
| Antivírus / EDR | Instalado e atualizado |
| Criptografia de disco | BitLocker (Windows) / FileVault (macOS) ativado |
| Firewall local | Ativado |
| Bloqueio de tela | Automático após 5 minutos |
| Senha de login | Conforme PWD-001 |
| Atualizações automáticas | Habilitado |

### 3.2 Dispositivos Pessoais (BYOD)

| Controle | Requisito |
|----------|-----------|
| Acesso ao CyberShield | Apenas via navegador web (sem dados locais) |
| SO atualizado | Versão suportada com patches |
| MFA obrigatório | Sim (TOTP ou WebAuthn) |
| Armazenamento local de dados | **Proibido** |
| Acesso administrativo | **Proibido** em BYOD |

---

## 4. Controles de Acesso Remoto

### 4.1 Autenticação

| Controle | Requisito |
|----------|-----------|
| MFA | Obrigatório para todos os acessos remotos |
| Sessão máxima | 8 horas (re-autenticação após) |
| Sessão inativa | Expirar após 30 minutos |
| Tentativas de login | Máximo 5 (bloqueio por 30 min) |
| IP whitelisting | Obrigatório para admin/super admin |

### 4.2 Rede

| Controle | Requisito |
|----------|-----------|
| Conexão | TLS 1.3 mínimo para todas as comunicações |
| Wi-Fi público | Permitido apenas com VPN ativa |
| VPN | Obrigatória para acesso a recursos internos |
| Split tunneling | Desabilitado quando VPN ativa |
| DNS seguro | DNS-over-HTTPS (DoH) recomendado |

### 4.3 Acesso Privilegiado Remoto

| Nível | Controles Adicionais |
|-------|---------------------|
| Admin | MFA + IP whitelist + sessão de 4h |
| Super Admin | MFA + IP whitelist + sessão de 2h + re-auth para ações críticas |
| Acesso de emergência | Break glass procedure (ref. `break_glass_procedure.md`) |

---

## 5. Proteção de Dados

### 5.1 Manuseio de Dados em Trabalho Remoto

| Controle | Requisito |
|----------|-----------|
| Dados confidenciais em dispositivo local | **Proibido** |
| Screenshots de dados de clientes | **Proibido** |
| Compartilhamento de tela | Apenas em ferramentas aprovadas, com cuidado |
| Impressão de dados confidenciais | **Proibido** em ambiente remoto |
| USB / mídia removível | **Proibido** para dados do sistema |
| Cloud storage pessoal | **Proibido** para dados corporativos |

### 5.2 Ambiente Físico

| Controle | Requisito |
|----------|-----------|
| Tela visível a terceiros | Filtro de privacidade recomendado |
| Chamadas confidenciais | Ambiente privado obrigatório |
| Documentos impressos | Destruição segura |
| Visitantes | Bloquear tela quando ausente |

---

## 6. Monitoramento

### 6.1 Registro de Atividades

| Atividade | Registrado | Retenção |
|-----------|:----------:|----------|
| Login / logout | ✅ | 7 anos |
| IP de origem | ✅ | 7 anos |
| Ações administrativas | ✅ | 7 anos |
| Falhas de autenticação | ✅ | 7 anos |
| Sessões ativas | ✅ | Tempo real |
| Geolocalização (IP-based) | ✅ | 1 ano |

### 6.2 Alertas

| Evento | Ação |
|--------|------|
| Login de país incomum | Alerta + verificação |
| Login simultâneo de IPs diferentes | Alerta + possível bloqueio |
| Acesso fora do horário comercial (admin) | Registro + alerta |
| Múltiplas falhas de MFA | Bloqueio temporário + alerta |

---

## 7. Incidentes em Trabalho Remoto

### 7.1 Cenários e Resposta

| Cenário | Ação Imediata |
|---------|--------------|
| Dispositivo perdido/roubado | Revogar sessões + alterar credenciais + notificar Security |
| Suspeita de comprometimento | Desconectar + notificar Security + preservar evidências |
| Acesso não autorizado detectado | Kill session + investigação + possível break glass |
| Rede comprometida | Desconectar + usar rede alternativa segura |

---

## 8. Responsabilidades

| Papel | Responsabilidade |
|-------|-----------------|
| Colaborador remoto | Seguir esta política, reportar incidentes, manter dispositivo seguro |
| Gestor direto | Garantir que equipe conhece a política |
| Security Officer | Monitorar conformidade, atualizar controles |
| TI / DevOps | Configurar ferramentas, VPN, monitoramento |

---

## 9. Treinamento

- Todo colaborador remoto deve completar treinamento de segurança antes de receber acesso
- Reciclagem anual obrigatória
- Conteúdo específico: phishing, segurança de Wi-Fi, proteção de dados pessoais

---

## 10. Evidências Técnicas

| Controle | Implementação | Evidência |
|----------|--------------|-----------|
| MFA | Obrigatório para acesso remoto | `mfa_factors` |
| Sessões | Timeout configurado | `active_sessions` |
| IP whitelist | Admin whitelist | `admin_ip_whitelist` |
| Auditoria | Logs de acesso | `audit_logs` |
| Monitoramento | Alertas de anomalia | `security_events` |

---

## 11. Conformidade

| Framework | Controle | Status |
|-----------|----------|:------:|
| SOC 2 | CC6.1 — Logical access | ✅ |
| SOC 2 | CC6.6 — System boundaries | ✅ |
| SOC 2 | CC6.7 — Threat management | ✅ |
| LGPD | Art. 46 — Medidas de segurança | ✅ |
| ISO 27001 | A.6.2.2 — Teleworking | ✅ |

---

## Referências

- [Política de Controle de Acesso](./02_access_control_policy.md) (ACP-001)
- [Política de Senhas](./16_password_policy.md) (PWD-001)
- [Procedimento Break Glass](../procedures/break_glass_procedure.md)
- [Política de Classificação da Informação](./19_information_classification_policy.md) (ICL-001)

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-03-05 | CyberShield Security | Versão inicial |
