# DPA — Data Processing Agreement (Acordo de Processamento de Dados)

| Campo | Valor |
|-------|-------|
| **Código** | DPA-001 |
| **Versão** | 1.0 |
| **Data Efetiva** | 2025-01-01 |
| **Base Legal** | LGPD Art. 39 / GDPR Art. 28 |

---

## 1. Partes

- **Controlador:** O cliente MSP que contrata o CyberShield ("Contratante")
- **Operador:** CyberShield LTDA ("CyberShield")
- **Sub-operadores:** Conforme listado na Seção 7

---

## 2. Objeto

Este DPA estabelece as obrigações de proteção de dados entre o Controlador e o Operador no âmbito da prestação dos serviços CyberShield, em conformidade com a LGPD e boas práticas internacionais.

---

## 3. Escopo do Tratamento

| Aspecto | Descrição |
|---------|-----------|
| **Natureza** | Armazenamento, processamento e análise de dados de segurança |
| **Finalidade** | Monitoramento de segurança, detecção de ameaças, compliance |
| **Duração** | Vigência do contrato de serviço + 90 dias |
| **Categorias de Dados** | Telemetria de segurança, logs de acesso, identificadores de dispositivo |
| **Categorias de Titulares** | Funcionários e colaboradores dos clientes do MSP |

---

## 4. Obrigações do Operador (CyberShield)

O CyberShield se compromete a:

4.1. Tratar dados pessoais **exclusivamente** conforme instruções documentadas do Controlador

4.2. Garantir que pessoas autorizadas a tratar dados estejam comprometidas com confidencialidade

4.3. Implementar medidas técnicas e organizacionais adequadas:
- Row Level Security (RLS) para isolamento de dados
- Criptografia em trânsito (TLS 1.3) e em repouso (AES-256)
- HMAC-SHA256 para autenticação de agentes
- Ed25519 para integridade de comandos
- Auditoria imutável com hash encadeado
- RBAC com princípio do menor privilégio
- MFA para acessos administrativos

4.4. Não contratar sub-operadores sem autorização prévia do Controlador

4.5. Auxiliar o Controlador no atendimento de solicitações de titulares (Art. 18 LGPD)

4.6. Disponibilizar informações necessárias para demonstrar compliance

4.7. Notificar o Controlador sobre incidentes de segurança em até **24 horas**

4.8. Ao término do contrato, devolver ou eliminar dados pessoais conforme instrução do Controlador

---

## 5. Obrigações do Controlador (MSP)

O MSP se compromete a:

5.1. Garantir base legal adequada para a coleta de dados dos endpoints

5.2. Informar seus funcionários/clientes sobre o monitoramento de segurança

5.3. Fornecer instruções claras e lícitas sobre o tratamento de dados

5.4. Notificar o CyberShield sobre solicitações de titulares que exijam ação do Operador

---

## 6. Transferência Internacional de Dados

6.1. Os dados são armazenados nos Estados Unidos (Lovable Cloud / AWS)

6.2. Garantias para transferência:
- Cláusulas Contratuais Padrão (SCCs) da Comissão Europeia
- Medidas técnicas suplementares (criptografia E2E, pseudonimização)
- Compliance do sub-operador com SOC 2 Type II

6.3. O Controlador autoriza expressamente a transferência internacional mediante as garantias acima

---

## 7. Sub-operadores Autorizados

| Sub-operador | Serviço | País | Dados Processados | Certificações |
|-------------|---------|------|-------------------|---------------|
| Lovable Cloud (Supabase Inc.) | Banco de dados, autenticação, Edge Functions | EUA | Todos os dados da plataforma | SOC 2 Type II |
| Stripe Inc. | Processamento de pagamentos | EUA | Nome, email, dados de pagamento | PCI-DSS Level 1 |
| GitHub Inc. | CI/CD (build de agentes) | EUA | Hashes de scripts, metadados de build | SOC 2 |

**Procedimento para novos sub-operadores:**
1. Notificação com 30 dias de antecedência
2. Avaliação de segurança e compliance
3. DPA obrigatório com o novo sub-operador
4. Controlador pode objetar em até 15 dias

---

## 8. Auditoria

8.1. O Controlador tem direito de auditar a compliance do Operador com este DPA

8.2. Auditorias devem ser agendadas com antecedência mínima de 30 dias

8.3. Frequência máxima: 1 auditoria por ano (exceto após incidente)

8.4. O CyberShield fornecerá:
- Relatórios SOC 2 (quando disponíveis)
- Resultados de testes de penetração (sanitizados)
- Evidências de controles técnicos
- Logs de auditoria relevantes

---

## 9. Incidentes de Segurança

9.1. O CyberShield notificará o Controlador sobre incidentes em até **24 horas** após a confirmação

9.2. A notificação incluirá:
- Natureza do incidente
- Dados e titulares afetados (estimativa)
- Medidas de contenção adotadas
- Contato do responsável

9.3. O CyberShield colaborará com o Controlador na:
- Investigação do incidente
- Notificação à ANPD (quando aplicável)
- Comunicação aos titulares (quando necessário)
- Implementação de ações corretivas

---

## 10. Direitos dos Titulares

10.1. O CyberShield auxiliará o Controlador a atender solicitações de titulares (Art. 18 LGPD):
- Acesso aos dados: Exportação via API/Dashboard em até 15 dias
- Correção: Via dashboard do MSP ou solicitação ao suporte
- Eliminação: Procedimento de deleção com confirmação
- Portabilidade: Exportação em formato JSON/CSV

10.2. Prazo de resposta do CyberShield ao Controlador: 5 dias úteis

---

## 11. Confidencialidade

11.1. Todas as informações trocadas são confidenciais

11.2. Sobrevive por 5 anos após o término do contrato

11.3. Exceções: informações públicas, exigência legal, autorização expressa

---

## 12. Responsabilidade

12.1. Cada parte é responsável pelo cumprimento de suas obrigações sob a LGPD

12.2. Em caso de dano ao titular por tratamento irregular do Operador, o Operador responderá solidariamente

12.3. A responsabilidade total é limitada conforme Termos de Serviço (TOS-001)

---

## 13. Término

13.1. Este DPA vigora enquanto durar o contrato de serviço

13.2. Após o término:
- Dados devolvidos ou eliminados em até 90 dias
- Logs de auditoria retidos conforme obrigação legal (5 anos)
- Certificação de eliminação fornecida ao Controlador

---

## 14. Disposições Gerais

14.1. Este DPA prevalece sobre termos conflitantes do contrato principal em matéria de proteção de dados

14.2. Alterações requerem acordo por escrito

14.3. Foro e legislação: conforme Termos de Serviço

---

## Histórico

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 1.0 | 2025-01-01 | CyberShield Legal & DPO | Versão inicial |
