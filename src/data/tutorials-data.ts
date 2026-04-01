/**
 * Tutorials data — barrel re-export (split by category)
 */
export type { Tutorial, TutorialStep, TroubleshootingItem, FAQ } from './tutorials/types';

import { tutorials_inicio } from './tutorials/inicio';
import { tutorials_dashboard } from './tutorials/dashboard';
import { tutorials_agentes } from './tutorials/agentes';
import { tutorials_seguranca } from './tutorials/seguranca';
import { tutorials_automacao } from './tutorials/automacao';
import { tutorials_admin } from './tutorials/admin';
import { tutorials_relatorios } from './tutorials/relatorios';
import { tutorials_integracoes } from './tutorials/integracoes';
import type { Tutorial, FAQ } from './tutorials/types';

export const tutorials: Tutorial[] = [
  ...tutorials_inicio,
  ...tutorials_dashboard,
  ...tutorials_agentes,
  ...tutorials_seguranca,
  ...tutorials_automacao,
  ...tutorials_admin,
  ...tutorials_relatorios,
  ...tutorials_integracoes,
];

// ─── Video mapping ───────────────────────────────────────
export const tutorialVideoUrls: Record<string, string> = {
  // "getting-started": "https://www.youtube.com/embed/YOUR_VIDEO_ID",
};

// ─── FAQ Data ────────────────────────────────────────────
export const faqs: FAQ[] = [
  { question: "O CyberShield funciona em quais sistemas operacionais?", answer: "Agente: Windows 10/11, Windows Server 2016+, Ubuntu 20.04+, CentOS 7+, Debian 11+, Amazon Linux 2/2023. Painel web: Chrome, Firefox, Edge, Safari — desktop e mobile. Apps nativos: roadmap para 2027.", category: "geral" },
  { question: "Quantos agentes posso instalar?", answer: "Starter: 25 agentes, Professional: 100, Enterprise: ilimitado. Agentes arquivados não contam. Upgrade instantâneo pelo painel. Para >500 agentes, pricing personalizado via comercial.", category: "planos" },
  { question: "Como funciona a detecção de ameaças?", answer: "4 camadas: (1) Assinaturas — base atualizada diariamente com 15M+ de assinaturas. (2) Heurística — detecta malware desconhecido por padrão de comportamento. (3) IA/ML — baseline comportamental por agente, detecta anomalias estatísticas. (4) Threat Intelligence — feeds de IOCs globais em tempo real.", category: "seguranca" },
  { question: "Os dados são criptografados?", answer: "Trânsito: TLS 1.3 em todas as comunicações. Repouso: AES-256 no banco de dados. HMAC keys: vault isolado com rotação automática a cada 90 dias. Backups: criptografados e georedundantes. Certificados: renovação automática via Let's Encrypt.", category: "seguranca" },
  { question: "Como exportar relatórios para auditoria?", answer: "3 formatos: CSV (granular, para BI), PDF (executivo, com gráficos), Excel (múltiplas abas). Todos incluem hash SHA-256 verificável publicamente em /verificar-laudo. Entregas automáticas agendáveis por e-mail (diário/semanal/mensal).", category: "relatorios" },
  { question: "O sistema é compatível com LGPD?", answer: "Sim: mapeamento de dados pessoais, RIPD (Relatório de Impacto), controle de retenção com exclusão automática, audit trail imutável, RBAC (controles de acesso por role), consent management e relatórios LGPD exportáveis em PDF.", category: "compliance" },
  { question: "Como funciona o suporte técnico?", answer: "Starter: e-mail (SLA 48h) + base de conhecimento 24/7. Professional: e-mail (SLA 24h) + chat in-app (horário comercial). Enterprise: e-mail (SLA 4h) + chat 24/7 + WhatsApp + Customer Success Manager dedicado + onboarding assistido.", category: "suporte" },
  { question: "Posso personalizar com minha marca (White Label)?", answer: "Professional/Enterprise: logotipo, cores, domínio CNAME, favicon, templates de e-mail, footer de PDF. Multi-tenant: white-label independente por tenant (ideal para MSPs).", category: "admin" },
  { question: "O que acontece se um agente ficar offline?", answer: "5min: status 'Sem contato'. 1h: alerta operador. 24h: status 'Crítico' + alerta admin. Tempos configuráveis. Quando volta: sincroniza dados do período offline automaticamente.", category: "agentes" },
  { question: "Como funcionam as notificações?", answer: "4 canais: in-app (sino), push browser, e-mail, integrações (Slack/Teams/WhatsApp). Regras de alerta customizáveis por severidade. Escalonamento automático (15min → 30min → 1h). Quiet hours e agrupamento inteligente anti-fatigue.", category: "geral" },
  { question: "Posso integrar com SIEM externo?", answer: "Sim: Splunk, QRadar, Elastic, Microsoft Sentinel via Syslog (TCP/UDP/TLS) ou API REST. Formatos: CEF, LEEF, JSON. Filtro de eventos configurável. Teste com evento de teste integrado.", category: "integracoes" },
  { question: "Como funciona a quarentena?", answer: "Sandbox criptografada (AES-256) isolada do filesystem. Ações: ver metadata, baixar sample (admin+MFA), verificar em bases externas, remover permanentemente ou restaurar (com justificativa no audit trail). Retenção: 90 dias.", category: "seguranca" },
  { question: "É possível fazer rollback de atualização do agente?", answer: "Sim: Admin → Rollout Policies → 'Reverter Versão'. Rollback progressivo com blast radius configurável. Monitoramento automático pós-rollback. Versões anteriores mantidas por 30 dias.", category: "agentes" },
  { question: "Como funciona o blast radius?", answer: "Limita impacto de ações automáticas: horário comercial 10%, fora 50%, manual até 100% (requer MFA + segunda aprovação). Previne que erro em uma regra derrube toda a infraestrutura.", category: "seguranca" },
  { question: "Qual o tamanho máximo de arquivo para scan?", answer: "Padrão: 500MB (configurável). Arquivos compactados: descompactação até 3 níveis. Extensões excluíveis. Para ISO/VMDK: recomendamos excluir do scan regular e fazer scan dedicado.", category: "seguranca" },
  { question: "A API tem rate limiting?", answer: "Sim: Auth 10/min, Mutations 30/min, Reads 100/min, Exports 5/5min. Headers X-RateLimit-Remaining e X-RateLimit-Reset incluídos. Para necessidades maiores, contate suporte para ajuste.", category: "integracoes" },
  { question: "Como funciona a resposta automática a ransomware?", answer: "Detecta criptografia anômala (>50 arquivos/min com alta entropia), isola endpoint em <30s, captura snapshot forense, notifica admin em todos os canais, verifica propagação lateral e inicia playbook automatizado.", category: "seguranca" },
];

// ─── Categories ──────────────────────────────────────────
export const categories = [
  { id: "all", label: "Todos" },
  { id: "inicio", label: "Início Rápido" },
  { id: "dashboard", label: "Dashboard" },
  { id: "agentes", label: "Agentes" },
  { id: "seguranca", label: "Segurança" },
  { id: "automacao", label: "Automação" },
  { id: "admin", label: "Administração" },
  { id: "relatorios", label: "Relatórios" },
];

export const difficultyConfig = {
  beginner: { label: "Iniciante", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  intermediate: { label: "Intermediário", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  advanced: { label: "Avançado", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  expert: { label: "Expert", color: "bg-red-500/10 text-red-400 border-red-500/20" },
};

export const quickStartCards = [
  { title: "Instalar Agente", desc: "Configure seu primeiro endpoint em 5 min", tutorialId: "getting-started" },
  { title: "Primeiro Scan", desc: "Execute verificação de segurança completa", tutorialId: "virus-scans" },
  { title: "Convidar Equipe", desc: "Adicione membros com permissões", tutorialId: "user-management" },
  { title: "Gerar Relatório", desc: "Crie relatório executivo em PDF", tutorialId: "reports-export" },
  { title: "Configurar Alertas", desc: "Nunca perca um evento crítico", tutorialId: "notifications-alerts" },
  { title: "Integrar SIEM", desc: "Envie eventos para seu SIEM", tutorialId: "siem-integration" },
];
