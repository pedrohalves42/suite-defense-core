import { Mail, MessageSquare, Bell } from 'lucide-react';

export interface NotificationChannel {
  id: string;
  tenant_id: string;
  channel_type: 'email' | 'telegram' | 'whatsapp' | 'webhook';
  name: string;
  config: Record<string, string>;
  is_verified: boolean;
  is_active: boolean;
  verified_at: string | null;
  created_at: string;
}

export type ChannelType = 'email' | 'telegram' | 'whatsapp' | 'webhook';

export const CHANNEL_COLORS: Record<ChannelType, string> = {
  email: 'bg-blue-500/10 text-blue-500',
  telegram: 'bg-cyan-500/10 text-cyan-500',
  whatsapp: 'bg-green-500/10 text-green-500',
  webhook: 'bg-purple-500/10 text-purple-500',
};

export function getConfigFields(type: ChannelType) {
  switch (type) {
    case 'email':
      return [{ key: 'email', label: 'Email', placeholder: 'admin@empresa.com', type: 'email' }];
    case 'telegram':
      return [
        { key: 'chat_id', label: 'Chat ID', placeholder: '-1001234567890', type: 'text' },
        { key: 'bot_token', label: 'Bot Token', placeholder: '123456:ABC-DEF...', type: 'password' },
      ];
    case 'whatsapp':
      return [{ key: 'phone', label: 'Número (com código)', placeholder: '+5511999999999', type: 'tel' }];
    case 'webhook':
      return [
        { key: 'url', label: 'URL do Webhook', placeholder: 'https://...', type: 'url' },
        { key: 'secret', label: 'Secret (opcional)', placeholder: 'secret_key', type: 'password' },
      ];
    default:
      return [];
  }
}
