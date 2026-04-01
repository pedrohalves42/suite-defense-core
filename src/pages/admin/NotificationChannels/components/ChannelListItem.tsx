import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Mail, MessageSquare, Bell, Trash2, CheckCircle, XCircle, RefreshCw, Send } from 'lucide-react';
import type { NotificationChannel, ChannelType } from '../types';
import { CHANNEL_COLORS } from '../types';

const channelIcons: Record<ChannelType, React.ReactNode> = {
  email: <Mail className="h-5 w-5" />,
  telegram: <MessageSquare className="h-5 w-5" />,
  whatsapp: <MessageSquare className="h-5 w-5" />,
  webhook: <Bell className="h-5 w-5" />,
};

function getChannelDetail(channel: NotificationChannel): string {
  const cfg = channel.config;
  switch (channel.channel_type) {
    case 'email': return cfg?.email || '';
    case 'telegram': return `Chat ID: ${cfg?.chat_id || ''}`;
    case 'whatsapp': return cfg?.phone || '';
    case 'webhook': return cfg?.url || '';
    default: return '';
  }
}

interface Props {
  channel: NotificationChannel;
  testingChannel: string | null;
  onToggle: (params: { channelId: string; isActive: boolean }) => void;
  onTest: (channel: NotificationChannel) => void;
  onDelete: (channelId: string) => void;
}

export default function ChannelListItem({ channel, testingChannel, onToggle, onTest, onDelete }: Props) {
  const type = channel.channel_type as ChannelType;
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-lg ${CHANNEL_COLORS[type]}`}>
          {channelIcons[type]}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{channel.name}</p>
            <Badge variant="outline" className="text-xs">{channel.channel_type}</Badge>
            {channel.is_verified ? (
              <Badge variant="default" className="text-xs bg-green-500">
                <CheckCircle className="h-3 w-3 mr-1" />Verificado
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                <XCircle className="h-3 w-3 mr-1" />Não verificado
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{getChannelDetail(channel)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          checked={channel.is_active}
          onCheckedChange={(checked) => onToggle({ channelId: channel.id, isActive: checked })}
        />
        <Button variant="outline" size="sm" onClick={() => onTest(channel)} disabled={testingChannel === channel.id}>
          {testingChannel === channel.id ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Testar
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(channel.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
