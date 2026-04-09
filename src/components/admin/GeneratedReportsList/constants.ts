import React from 'react';
import { Shield, HardDrive, Bug, Globe, FileText, Phone, MessageCircle, Mail } from 'lucide-react';

export const reportTypeIcons: Record<string, React.ReactNode> = {
  'full_security': React.createElement(Shield, { className: "h-4 w-4" }),
  'software_inventory': React.createElement(HardDrive, { className: "h-4 w-4" }),
  'vulnerabilities': React.createElement(Bug, { className: "h-4 w-4" }),
  'antivirus': React.createElement(Shield, { className: "h-4 w-4 text-green-500" }),
  'web_activity': React.createElement(Globe, { className: "h-4 w-4" }),
};

export const reportTypeLabels: Record<string, string> = {
  'full_security': 'Segurança Completo',
  'software_inventory': 'Inventário de Software',
  'vulnerabilities': 'Vulnerabilidades',
  'antivirus': 'Antivírus',
  'web_activity': 'Atividade Web',
};

export const triggeredByLabels: Record<string, string> = {
  'job_completion': 'Automático',
  'scheduled': 'Agendado',
  'manual': 'Manual',
};

export const riskLevelColors: Record<string, string> = {
  'CRÍTICO': 'bg-red-500',
  'ALTO': 'bg-orange-500',
  'MÉDIO': 'bg-yellow-500',
  'BAIXO': 'bg-green-500',
};

export const salesStatusColors: Record<string, string> = {
  'open': 'bg-blue-500',
  'contacted': 'bg-yellow-500',
  'negotiated': 'bg-orange-500',
  'closed_won': 'bg-green-500',
  'closed_lost': 'bg-red-500',
};

export const salesStatusLabels: Record<string, string> = {
  'open': 'Aberto',
  'contacted': 'Contatado',
  'negotiated': 'Negociando',
  'closed_won': 'Fechado ✓',
  'closed_lost': 'Perdido ✗',
};

export const nextActionIcons: Record<string, React.ReactNode> = {
  'schedule_call': React.createElement(Phone, { className: "h-3 w-3" }),
  'send_whatsapp': React.createElement(MessageCircle, { className: "h-3 w-3" }),
  'await_client': React.createElement(Mail, { className: "h-3 w-3" }),
};

export const nextActionLabels: Record<string, string> = {
  'schedule_call': 'Ligar',
  'send_whatsapp': 'WhatsApp',
  'await_client': 'Aguardar',
};

export const defaultReportIcon = React.createElement(FileText, { className: "h-4 w-4" });
