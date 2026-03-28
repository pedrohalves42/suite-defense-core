import { MessageCircle, Send, Mail, Bell } from 'lucide-react';

export interface NotificationChannel {
  id: string;
  tenant_id: string;
  channel_type: string;
  name: string;
  config: Record<string, unknown>;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface NotificationPreference {
  id: string;
  channel_id: string;
  alert_types: string[];
  severity_filter: string[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  enabled: boolean;
}

export interface NotificationLog {
  id: string;
  channel_type: string;
  recipient: string;
  message_preview: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ScheduledReport {
  id: string;
  tenant_id: string;
  name: string;
  schedule: string;
  day_of_week: number;
  hour: number;
  recipients: string[];
  include_software_inventory: boolean;
  include_vulnerabilities: boolean;
  include_web_activity: boolean;
  include_antivirus: boolean;
  include_agents_summary: boolean;
  is_active: boolean;
  last_sent_at: string | null;
  next_send_at: string | null;
  created_at: string;
}

export type ChannelType = 'whatsapp' | 'telegram' | 'email';

export const CHANNEL_ICONS: Record<string, typeof Bell> = {
  whatsapp: MessageCircle,
  telegram: Send,
  email: Mail,
  sms: Bell
};

export const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  email: 'Email',
  sms: 'SMS'
};

export const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Crítico' },
  { value: 'high', label: 'Alto' },
  { value: 'medium', label: 'Médio' },
  { value: 'low', label: 'Baixo' },
  { value: 'info', label: 'Informativo' }
];

export const ALERT_TYPE_OPTIONS = [
  { value: 'agent_offline', label: 'Computador Offline' },
  { value: 'high_cpu', label: 'CPU Alta' },
  { value: 'high_memory', label: 'Memória Alta' },
  { value: 'high_disk', label: 'Disco Cheio' },
  { value: 'threat_detected', label: 'Ameaça Detectada' },
  { value: 'vulnerability_found', label: 'Vulnerabilidade Encontrada' },
  { value: 'software_installed', label: 'Software Instalado' },
  { value: 'job_failed', label: 'Tarefa Falhou' }
];

export const DAY_OF_WEEK_OPTIONS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' }
];

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, '0')}:00`
}));
