import { Shield, ShieldCheck, Lock, Server, CheckCircle2, Clock, AlertTriangle, Eye } from 'lucide-react';
import type { ControlDef } from './types';

export const FRAMEWORKS = [
  { id: 'iso27001', name: 'ISO 27001', icon: Shield, description: 'Sistema de Gestão de Segurança da Informação' },
  { id: 'soc2', name: 'SOC 2 Type II', icon: ShieldCheck, description: 'Controles de Serviço e Organização' },
  { id: 'lgpd', name: 'LGPD', icon: Lock, description: 'Lei Geral de Proteção de Dados' },
  { id: 'nist', name: 'NIST CSF', icon: Server, description: 'Framework de Cibersegurança' },
] as const;

export const CONTROL_SETS: Record<string, ControlDef[]> = {
  iso27001: [
    { id: 'A.5.1', title: 'Políticas de Segurança da Informação', category: 'Políticas', desc: 'Diretrizes de gestão para segurança da informação' },
    { id: 'A.6.1', title: 'Organização da Segurança', category: 'Organização', desc: 'Papéis e responsabilidades definidos' },
    { id: 'A.8.1', title: 'Gestão de Ativos', category: 'Ativos', desc: 'Inventário e propriedade de ativos' },
    { id: 'A.9.1', title: 'Controle de Acesso', category: 'Acesso', desc: 'Requisitos de controle de acesso' },
    { id: 'A.10.1', title: 'Criptografia', category: 'Criptografia', desc: 'Controles criptográficos' },
    { id: 'A.12.1', title: 'Segurança nas Operações', category: 'Operações', desc: 'Procedimentos e responsabilidades operacionais' },
    { id: 'A.12.2', title: 'Proteção contra Malware', category: 'Operações', desc: 'Controles contra software malicioso' },
    { id: 'A.12.4', title: 'Registro e Monitoramento', category: 'Operações', desc: 'Logs de eventos e monitoramento' },
    { id: 'A.12.6', title: 'Gestão de Vulnerabilidades', category: 'Operações', desc: 'Gestão de vulnerabilidades técnicas' },
    { id: 'A.16.1', title: 'Gestão de Incidentes', category: 'Incidentes', desc: 'Gestão de incidentes de segurança' },
    { id: 'A.18.1', title: 'Conformidade Legal', category: 'Conformidade', desc: 'Identificação de legislação aplicável' },
  ],
  soc2: [
    { id: 'CC1.1', title: 'Integridade e Valores Éticos', category: 'Ambiente de Controle', desc: 'Compromisso com integridade' },
    { id: 'CC1.2', title: 'Supervisão do Conselho', category: 'Ambiente de Controle', desc: 'Monitoramento de riscos' },
    { id: 'CC1.3', title: 'Estrutura Organizacional', category: 'Ambiente de Controle', desc: 'RBAC e estrutura de papéis' },
    { id: 'CC1.5', title: 'Responsabilização', category: 'Ambiente de Controle', desc: 'Trilha de auditoria imutável' },
    { id: 'CC2.1', title: 'Comunicação Interna', category: 'Comunicação', desc: 'Políticas documentadas' },
    { id: 'CC3.1', title: 'Avaliação de Riscos', category: 'Risco', desc: 'Monitoramento de riscos' },
    { id: 'CC6.1', title: 'Controles de Acesso Lógico', category: 'Acesso', desc: 'RBAC + RLS no banco' },
    { id: 'CC6.2', title: 'Autenticação', category: 'Acesso', desc: 'JWT + HMAC + MFA' },
    { id: 'CC6.3', title: 'Registro/Autorização', category: 'Acesso', desc: 'Sistema de enrollment' },
    { id: 'CC7.1', title: 'Monitoramento de Infraestrutura', category: 'Monitoramento', desc: 'Logs de auditoria' },
    { id: 'CC7.2', title: 'Detecção de Anomalias', category: 'Monitoramento', desc: 'Regras de alerta + agentes' },
    { id: 'CC8.1', title: 'Gestão de Mudanças', category: 'Mudanças', desc: 'Controle de mudanças' },
  ],
  lgpd: [
    { id: 'ART-6', title: 'Bases Legais do Tratamento', category: 'Tratamento', desc: 'Hipóteses de tratamento de dados pessoais' },
    { id: 'ART-7', title: 'Consentimento', category: 'Tratamento', desc: 'Fornecimento de consentimento pelo titular' },
    { id: 'ART-18', title: 'Direitos dos Titulares', category: 'Direitos', desc: 'Confirmação de existência e acesso a dados' },
    { id: 'ART-37', title: 'Registro de Operações', category: 'Governança', desc: 'Registro das operações de tratamento' },
    { id: 'ART-41', title: 'Encarregado (DPO)', category: 'Governança', desc: 'Designação de encarregado' },
    { id: 'ART-46', title: 'Segurança e Sigilo', category: 'Segurança', desc: 'Medidas de segurança aptas a proteger dados' },
    { id: 'ART-48', title: 'Comunicação de Incidentes', category: 'Incidentes', desc: 'Comunicação à ANPD e ao titular' },
  ],
  nist: [
    { id: 'ID.AM', title: 'Gestão de Ativos', category: 'Identificar', desc: 'Dados, pessoal, dispositivos e sistemas' },
    { id: 'ID.RA', title: 'Avaliação de Riscos', category: 'Identificar', desc: 'Riscos para operações organizacionais' },
    { id: 'PR.AC', title: 'Controle de Acesso', category: 'Proteger', desc: 'Gerenciamento de identidade e acesso' },
    { id: 'PR.DS', title: 'Segurança de Dados', category: 'Proteger', desc: 'Dados em repouso e em trânsito protegidos' },
    { id: 'PR.IP', title: 'Processos de Proteção', category: 'Proteger', desc: 'Políticas e procedimentos de segurança' },
    { id: 'DE.AE', title: 'Anomalias e Eventos', category: 'Detectar', desc: 'Detecção de atividade anômala' },
    { id: 'DE.CM', title: 'Monitoramento Contínuo', category: 'Detectar', desc: 'Monitoramento de eventos de segurança' },
    { id: 'RS.RP', title: 'Planejamento de Resposta', category: 'Responder', desc: 'Plano de resposta a incidentes' },
    { id: 'RC.RP', title: 'Planejamento de Recuperação', category: 'Recuperar', desc: 'Plano de recuperação executado' },
  ],
};

export const statusConfig = {
  compliant: { label: 'Conforme', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle2 },
  partial: { label: 'Parcial', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', icon: Clock },
  non_compliant: { label: 'Não Conforme', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: AlertTriangle },
  not_applicable: { label: 'N/A', color: 'bg-muted text-muted-foreground', icon: Eye },
} as const;
