## Fase 2 — Integração com o Assistente SOC 2

### Escopo
Integrar o `soc2-evidence-collector` (Fase 1) ao `SOC2PolicyWizard` existente, adicionando auto-preenchimento inteligente e indicadores visuais.

### Tarefas

#### 2.1 — Botão "Auto-preencher" no Wizard
- Adicionar botão "🤖 Auto-preencher" no header de cada step de critério
- Ao clicar, chama o hook `useSOC2EvidenceCollector` e preenche `notes` e `status`
- Custo-eficiente: coleta evidências uma única vez e distribui para todos os steps

#### 2.2 — Preenchimento automático das Notas
- Mapear as descrições de evidência do coletor para o campo `notes` de cada critério
- Concatenar múltiplas evidências em texto formatado
- Definir `status` automaticamente baseado na força (strong→implemented, moderate→in_progress, weak/none→not_started)

#### 2.3 — Indicador visual de força (🔴🟡🟢)
- Badge ao lado de cada step no wizard mostrando força do controle
- Baseado no summary retornado pelo coletor

#### 2.4 — Edição manual após auto-preenchimento
- Campo `notes` permanece editável após auto-preenchimento (já funciona com state atual)
- Adicionar indicador "Auto-preenchido" quando notas vêm do coletor

#### 2.5 — Histórico de preenchimento na tabela `soc2_control_status`
- Ao salvar (handleSave), gravar também na tabela `soc2_control_status`
- Campo `auto_filled` indica se foi automático

### Arquitetura (custo-eficiente)
- Uma ÚNICA chamada à Edge Function coleta tudo (não por controle)
- Cache do resultado no state React (não refaz a cada step)
- Sem chamadas adicionais ao banco no frontend

### Arquivos modificados
- `src/components/soc2/SOC2PolicyWizard.tsx` — principal
- Nenhum novo componente necessário (tudo inline no wizard)
