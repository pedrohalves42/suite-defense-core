import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Send, Trash2, CheckCircle2, XCircle, Clock, Bell } from 'lucide-react';
import type { NotificationChannel, NotificationPreference, NotificationLog } from './types';
import { CHANNEL_ICONS, CHANNEL_LABELS, SEVERITY_OPTIONS } from './types';

interface ChannelCardProps {
  channel: NotificationChannel;
  preference: NotificationPreference | undefined;
  logs: NotificationLog[];
  onToggle: (id: string, isActive: boolean) => void;
  onTest: (channel: NotificationChannel) => void;
  onDelete: (id: string) => void;
  onUpdatePreferences: (channelId: string, updates: Partial<NotificationPreference>) => void;
}

export default function ChannelCard({
  channel,
  preference,
  logs: channelLogs,
  onToggle,
  onTest,
  onDelete,
  onUpdatePreferences,
}: ChannelCardProps) {
  const Icon = CHANNEL_ICONS[channel.channel_type] || Bell;
  const lastDelivery = channelLogs[0];
  const last24hLogs = channelLogs.filter(l => {
    const logTime = new Date(l.created_at).getTime();
    return Date.now() - logTime < 24 * 60 * 60 * 1000;
  });
  const successRate = last24hLogs.length > 0
    ? Math.round((last24hLogs.filter(l => l.status === 'sent').length / last24hLogs.length) * 100)
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{channel.name}</CardTitle>
              <CardDescription>{CHANNEL_LABELS[channel.channel_type]}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {channel.is_verified ? (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Verificado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                <Clock className="h-3 w-3 mr-1" />
                Pendente
              </Badge>
            )}
          </div>
        </div>
        {lastDelivery && (
          <div className="mt-2 pt-2 border-t flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              {lastDelivery.status === 'sent' ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500" />
              )}
              <span className="text-muted-foreground">
                Última: {lastDelivery.status === 'sent' ? 'Sucesso' : 'Falha'}
              </span>
            </div>
            {successRate !== null && (
              <Badge
                variant="outline"
                className={`text-xs ${successRate >= 90 ? 'border-green-500/30 text-green-600' : successRate >= 70 ? 'border-yellow-500/30 text-yellow-600' : 'border-red-500/30 text-red-600'}`}
              >
                {successRate}% (24h)
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Canal Ativo</Label>
          <Switch
            checked={channel.is_active}
            onCheckedChange={(checked) => onToggle(channel.id, checked)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Severidades</Label>
          <div className="flex flex-wrap gap-2">
            {SEVERITY_OPTIONS.map((sev) => (
              <Badge
                key={sev.value}
                variant={preference?.severity_filter?.includes(sev.value) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => {
                  const current = preference?.severity_filter || [];
                  const updated = current.includes(sev.value)
                    ? current.filter(s => s !== sev.value)
                    : [...current, sev.value];
                  onUpdatePreferences(channel.id, { severity_filter: updated });
                }}
              >
                {sev.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onTest(channel)}>
            <Send className="h-3 w-3 mr-1" />
            Testar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(channel.id)}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Remover
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
