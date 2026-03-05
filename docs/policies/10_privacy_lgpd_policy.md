# Política de Privacidade e Proteção de Dados (LGPD)

| Campo | Valor |
|-------|-------|
| **Código** | PDP-001 |
| **Versão** | 1.0 |
| **Status** | Aprovado |
| **Responsável** | Encarregado de Proteção de Dados (DPO) |
| **Data Efetiva** | 2025-01-01 |
| **Revisão** | 2026-01-01 |
| **Critérios SOC 2** | CC2, PI1 |
| **Base Legal** | Lei 13.709/2018 (LGPD) |

---

## 1. Objetivo

Estabelecer diretrizes para o tratamento de dados pessoais no CyberShield, garantindo conformidade com a Lei Geral de Proteção de Dados (LGPD) e princípios internacionais de privacidade.

---

## 2. Escopo

Esta política aplica-se a:
- Todos os dados pessoais coletados, armazenados, processados ou transmitidos pela plataforma
- Dados de usuários da plataforma (operadores, administradores, analistas)
- Dados coletados dos endpoints monitorados pelos agentes
- Dados de parceiros MSP e seus clientes finais
- Todos os ambientes: desenvolvimento, homologação e produção

---

## 3. Definições

| Termo | Definição |
|-------|-----------|
| **Dados Pessoais** | Qualquer informação relacionada a pessoa natural identificada ou identificável |
| **Dados Sensíveis** | Dados sobre origem racial, convicção religiosa, opinião política, saúde, vida sexual, dado genético ou biométrico |
| **Titular** | Pessoa natural a quem se referem os dados pessoais |
| **Controlador** | CyberShield (decisões sobre tratamento) |
| **Operador** | MSPs que utilizam a plataforma |
| **DPO/Encarregado** | Responsável pela comunicação com ANPD e titulares |
| **ANPD** | Autoridade Nacional de Proteção de Dados |

---

## 4. Princípios de Tratamento (Art. 6º LGPD)

| Princípio | Implementação no CyberShield |
|-----------|------------------------------|
| **Finalidade** | Dados coletados exclusivamente para monitoramento de segurança cibernética |
| **Adequação** | Coleta limitada ao necessário para detecção de ameaças |
| **Necessidade** | Minimização de dados — apenas telemetria de segurança |
| **Livre Acesso** | Dashboard para visualização de dados coletados |
| **Qualidade** | Validação de integridade via SHA-256 e hash encadeado |
| **Transparência** | Documentação clara de todos os tratamentos |
| **Segurança** | Criptografia E2E, HMAC, Ed25519, RLS multi-tenant |
| **Prevenção** | Detecção proativa de ameaças e remediação automática |
| **Não Discriminação** | Dados de segurança não utilizados para perfilamento pessoal |
| **Responsabilização** | Audit trail imutável, evidências forenses |

---

## 5. Mapeamento de Dados Pessoais

### 5.1 Dados Coletados pelo Agente

| Dado | Classificação | Base Legal | Finalidade | Retenção |
|------|--------------|------------|------------|----------|
| Hostname do endpoint | Pessoal (identificável) | Legítimo Interesse (Art. 10) | Identificação do dispositivo | Duração do contrato + 90 dias |
| IP Address | Pessoal | Legítimo Interesse | Geolocalização e segurança de rede | 180 dias |
| Usuário logado (Windows) | Pessoal | Legítimo Interesse | Correlação de eventos de segurança | 180 dias |
| Processos em execução | Técnico | Legítimo Interesse | Detecção de malware | 90 dias |
| Status de antivírus/firewall | Técnico | Legítimo Interesse | Compliance de segurança | 180 dias |
| Certificados digitais | Técnico | Legítimo Interesse | Inventário de confiança | 180 dias |
| Dispositivos USB conectados | Técnico | Legítimo Interesse | Prevenção de vazamento de dados | 90 dias |
| Hash de arquivos monitorados | Técnico | Legítimo Interesse | Integridade de sistema | 365 dias |

### 5.2 Dados da Plataforma

| Dado | Classificação | Base Legal | Finalidade | Retenção |
|------|--------------|------------|------------|----------|
| Nome do operador | Pessoal | Execução contratual (Art. 7, V) | Identificação do usuário | Duração do contrato |
| Email | Pessoal | Execução contratual | Autenticação e comunicação | Duração do contrato |
| Logs de acesso | Pessoal | Obrigação legal | Auditoria de segurança | 5 anos |
| IP de acesso à plataforma | Pessoal | Legítimo Interesse | Segurança e detecção de fraude | 180 dias |

### 5.3 Dados NÃO Coletados

O CyberShield **expressamente NÃO coleta**:
- Conteúdo de arquivos pessoais
- Histórico de navegação
- Senhas ou credenciais do usuário final
- Dados biométricos
- Comunicações pessoais (email, chat)
- Dados de localização GPS
- Dados financeiros pessoais

---

## 6. Bases Legais Utilizadas

| Base Legal | Aplicação | Referência LGPD |
|------------|-----------|-----------------|
| **Execução Contratual** | Prestação do serviço de monitoramento | Art. 7º, V |
| **Legítimo Interesse** | Detecção de ameaças e telemetria de segurança | Art. 7º, IX / Art. 10 |
| **Obrigação Legal** | Manutenção de logs de auditoria | Art. 7º, II |
| **Proteção à Vida** | Resposta a incidentes críticos de segurança | Art. 7º, VII |

---

## 7. Encarregado de Proteção de Dados (DPO)

### 7.1 Designação
O Encarregado de Proteção de Dados é designado formalmente e registrado junto à ANPD.

### 7.2 Responsabilidades
- Aceitar reclamações e comunicações dos titulares
- Receber comunicações da ANPD e adotar providências
- Orientar funcionários e contratados sobre práticas de proteção de dados
- Executar as demais atribuições determinadas pelo controlador

### 7.3 Canal de Contato
- Email: dpo@cybershield.com.br
- Formulário: disponível na plataforma
- Prazo de resposta: 15 dias úteis (Art. 18, §5º)

---

## 8. Direitos dos Titulares (Art. 18)

| Direito | Procedimento | Prazo |
|---------|-------------|-------|
| **Confirmação de tratamento** | Solicitação via canal DPO | 15 dias |
| **Acesso aos dados** | Exportação via dashboard ou solicitação | 15 dias |
| **Correção de dados** | Atualização pelo operador ou solicitação | 15 dias |
| **Anonimização/bloqueio** | Avaliação caso a caso | 15 dias |
| **Eliminação** | Execução do direito ao esquecimento | 15 dias |
| **Portabilidade** | Exportação em formato estruturado (JSON/CSV) | 15 dias |
| **Informação sobre compartilhamento** | Relatório de sub-processadores | 15 dias |
| **Revogação do consentimento** | Não aplicável (base legal: legítimo interesse) | N/A |
| **Oposição ao tratamento** | Avaliação de legítimo interesse | 15 dias |

---

## 9. Compartilhamento de Dados

### 9.1 Sub-processadores

| Sub-processador | Dados Compartilhados | Finalidade | Localização | DPA |
|-----------------|---------------------|------------|-------------|-----|
| CyberShield Cloud (Supabase) | Todos os dados da plataforma | Infraestrutura de banco de dados | EUA (AWS) | Sim |
| Stripe | Email, nome do titular da conta | Processamento de pagamentos | EUA | Sim |
| GitHub Actions | Hash de scripts, metadados de build | CI/CD de agentes | EUA | Sim |

### 9.2 Transferência Internacional
- Dados armazenados em servidores nos EUA (CyberShield Cloud)
- Garantias: Cláusulas Contratuais Padrão (SCCs) e medidas técnicas suplementares
- Criptografia em trânsito (TLS 1.3) e em repouso (AES-256)

---

## 10. Segurança dos Dados

### 10.1 Medidas Técnicas

| Controle | Implementação |
|----------|--------------|
| Criptografia em trânsito | TLS 1.3 obrigatório |
| Criptografia em repouso | AES-256 (CyberShield Cloud) |
| Autenticação de agentes | HMAC-SHA256 com nonce anti-replay |
| Integridade de comandos | Ed25519 digital signatures |
| Isolamento de dados | Row Level Security (RLS) por tenant |
| Tokens | SHA-256 hash storage (nunca em texto) |
| Auditoria | Logs imutáveis com hash encadeado |
| Acesso privilegiado | RBAC + MFA para administradores |

### 10.2 Medidas Organizacionais

| Controle | Descrição |
|----------|-----------|
| Acesso mínimo | Princípio do menor privilégio |
| Segregação de funções | Roles distintos (admin, operator, analyst, viewer) |
| Treinamento | Programa de conscientização em segurança |
| Revisão de acesso | Trimestral |
| Gestão de incidentes | PRI com playbooks e escalação |

---

## 11. Retenção e Descarte

| Categoria | Período de Retenção | Método de Descarte |
|-----------|--------------------|--------------------|
| Telemetria de segurança | 90-365 dias (conforme tipo) | Deleção automatizada com verificação |
| Logs de auditoria | 5 anos | Não aplicável (obrigação legal) |
| Dados de conta | Duração do contrato + 90 dias | Anonimização ou deleção |
| Backups | 30 dias após exclusão dos dados originais | Destruição criptográfica |

---

## 12. Incidentes de Segurança com Dados Pessoais

### 12.1 Notificação à ANPD (Art. 48)
- **Prazo**: 2 dias úteis após confirmação do incidente
- **Conteúdo**: Natureza dos dados, titulares afetados, medidas adotadas
- **Responsável**: DPO em coordenação com equipe de resposta a incidentes

### 12.2 Notificação aos Titulares
- Quando o incidente puder acarretar risco ou dano relevante
- Via email e notificação na plataforma
- Incluindo medidas que o titular pode adotar

---

## 13. Avaliação de Legítimo Interesse (LIA)

### 13.1 Teste de Necessidade
A coleta de telemetria de segurança é **estritamente necessária** para:
- Detectar e prevenir ameaças cibernéticas em tempo real
- Garantir a integridade dos sistemas monitorados
- Cumprir obrigações contratuais com os MSPs

### 13.2 Teste de Balanceamento
- **Interesse do Controlador**: Proteção de infraestrutura de TI dos clientes
- **Expectativa do Titular**: Razoável — funcionário espera que empresa monitore segurança do dispositivo corporativo
- **Impacto**: Mínimo — dados técnicos de segurança, sem perfilamento pessoal
- **Salvaguardas**: Minimização, pseudonimização, acesso restrito, logs imutáveis

### 13.3 Conclusão
O legítimo interesse é a base legal adequada para o tratamento de dados de telemetria de segurança, dados os controles técnicos e organizacionais implementados.

---

## 14. Governança de Privacidade

### 14.1 Privacy by Design
- Minimização de dados na coleta do agente
- Pseudonimização quando possível
- RLS como controle de acesso nativo

### 14.2 Privacy by Default
- Coleta mínima por padrão
- Funcionalidades de monitoramento avançado requerem ativação explícita
- Dados pessoais não compartilhados sem necessidade

---

## 15. Conformidade e Auditoria

### 15.1 Avaliações Periódicas
- Revisão anual desta política
- RIPD/DPIA para novos tratamentos de dados
- Auditoria de conformidade semestral

### 15.2 Registro de Tratamento
- ROPA mantido e atualizado conforme Art. 37
- Disponível para ANPD sob demanda

---

## Histórico do Documento

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Legal & Security | Versão inicial |
