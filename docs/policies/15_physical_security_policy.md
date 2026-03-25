# Política de Segurança Física e Gestão de Ativos

| Campo | Valor |
|-------|-------|
| **Política** | POL-015 |
| **Versão** | 1.0 |
| **Data** | 2026-03-25 |
| **Responsável** | CISO |
| **Próxima Revisão** | 2026-06-25 |
| **Classificação** | Interno |

## 1. Objetivo

Estabelecer controles de segurança física para proteger os ativos de informação do CyberShield contra acesso não autorizado, danos, interferência ou roubo, em conformidade com ISO 27001 Anexo A.11 e SOC 2 CC6.4.

## 2. Escopo

Aplica-se a:
- Todos os funcionários, contratados e terceiros com acesso a instalações ou ativos
- Data centers e escritórios da CyberShield
- Equipamentos de desenvolvimento, produção e infraestrutura de rede
- Dispositivos corporativos e pessoais (BYOD) utilizados para trabalho

## 3. Controles de Data Center (Provedor Cloud)

O CyberShield utiliza infraestrutura em nuvem com as seguintes certificações do provedor:

| Certificação | Status | Verificação |
|--------------|--------|-------------|
| SOC 2 Type II | ✅ Ativo | Relatório anual solicitado |
| ISO 27001 | ✅ Ativo | Certificado verificado |
| PCI DSS Level 1 | ✅ Ativo | Atestado disponível |

Controles físicos garantidos pelo provedor:
- Biometria e cartões de acesso multifator
- CFTV 24x7 com retenção mínima de 90 dias
- Registro obrigatório de visitantes com acompanhamento
- Detecção de intrusão e alarmes perimetrais
- Redundância de energia (UPS + gerador) e climatização (N+1)

## 4. Controles de Escritório

| Controle | Descrição | Frequência |
|----------|-----------|------------|
| Acesso físico | Cartão RFID + PIN/biometria | Contínuo |
| Registro de visitantes | Check-in obrigatório, acompanhamento permanente | Por visita |
| Áreas restritas | Sala de servidores local com acesso restrito a TI | Contínuo |
| CFTV | Cobertura de entradas/saídas, retenção 30 dias | Contínuo |
| Mesa limpa | Documentos sensíveis guardados ao sair | Diário |
| Tela limpa | Bloqueio automático após 5 minutos de inatividade | Contínuo |

## 5. Gestão de Ativos

### 5.1 Inventário

- Todos os ativos de TI devem ser registrados no inventário corporativo
- Inventário revisado trimestralmente
- Cada ativo deve ter um proprietário designado

### 5.2 Classificação de Ativos

| Classificação | Exemplos | Controles |
|---------------|----------|-----------|
| **Crítico** | Servidores de produção, chaves criptográficas | Criptografia, backup, acesso restrito |
| **Sensível** | Workstations de dev, repositórios de código | Criptografia de disco, autenticação forte |
| **Interno** | Equipamentos de escritório, impressoras | Controle de acesso básico |
| **Público** | Material de marketing | Controles mínimos |

### 5.3 Equipamentos

- **Workstations**: Disco criptografado (BitLocker/FileVault), bloqueio automático
- **Dispositivos móveis**: MDM com capacidade de wipe remoto, criptografia obrigatória
- **Mídia removível**: Uso controlado e aprovado por TI, criptografia quando permitido

### 5.4 Descarte Seguro

Conforme NIST SP 800-88:
- **Dados confidenciais**: Destruição física ou purga criptográfica certificada
- **Equipamentos**: Certificado de destruição emitido por fornecedor autorizado
- **Registros**: Manter certificados de destruição por 5 anos

## 6. Procedimentos de Acesso de Terceiros

1. Solicitação formal com mínimo 48h de antecedência
2. Aprovação do CISO ou CTO
3. NDA (Acordo de Confidencialidade) assinado antes do acesso
4. Acompanhamento por funcionário autorizado durante toda a visita
5. Devolução de crachás temporários e equipamentos ao término
6. Registro de entrada/saída no log de visitantes

## 7. Resposta a Incidentes de Segurança Física

| Severidade | Exemplo | Ação Imediata | Responsável |
|------------|---------|---------------|-------------|
| **Crítico** | Invasão, roubo de equipamento | Acionar segurança + CISO + polícia | CISO |
| **Alto** | Tentativa de acesso não autorizado | Acionar CISO, revisar CFTV | Facilities |
| **Médio** | Perda de crachá, porta aberta | Revogar acesso, emitir novo crachá | TI |
| **Baixo** | Visitante sem acompanhante | Acompanhar imediatamente | Qualquer funcionário |

## 8. Mapeamento de Conformidade

| Controle | SOC 2 | ISO 27001 | LGPD | NIST CSF |
|----------|-------|-----------|------|----------|
| Acesso físico | CC6.4 | A.11.1.1-3 | Art. 46 | PR.AC-2 |
| CFTV/Monitoramento | CC6.4 | A.11.1.6 | Art. 46 | DE.CM-2 |
| Gestão de ativos | CC6.1 | A.8.1.1-4 | Art. 46 | ID.AM-1 |
| Descarte seguro | CC6.5 | A.11.2.7 | Art. 49 | PR.DS-3 |
| Mesa/tela limpa | CC6.1 | A.11.2.9 | Art. 46 | PR.AC-3 |

## 9. Responsabilidades

| Papel | Responsabilidade |
|-------|------------------|
| CISO | Aprovar política, revisar incidentes, auditorias |
| CTO | Aprovar acessos de terceiros, priorizar investimentos |
| Facilities | Manter controles físicos, gerenciar CFTV |
| TI | Inventário de ativos, MDM, descarte seguro |
| Funcionários | Reportar incidentes, seguir política de mesa/tela limpa |
| RH | Processo de offboarding (devolução de equipamentos) |

## 10. Histórico de Revisões

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2026-03-25 | CISO | Criação inicial |
