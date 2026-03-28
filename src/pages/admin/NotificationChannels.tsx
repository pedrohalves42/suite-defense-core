import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Mail, MessageSquare, Bell, Plus, Trash2, 
  CheckCircle, XCircle, RefreshCw, Send, Settings
} from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { logger } from '@/lib/logger';

interface NotificationChannel {
  id: string;
  tenant_id: string;
  channel_type: 'email' | 'telegram' | 'whatsapp' | 'webhook';
  name: string;
  config: Record<string, unknown>;
  is_verified: boolean;
  is_active: boolean;
  verified_at: string | null;
  created_at: string;
}

type ChannelType = 'email' | 'telegram' | 'whatsapp' | 'webhook';

const channelIcons: Record<ChannelType, React.ReactNode> = {
  email: <Mail className="h-5 w-5" />,
  telegram: <MessageSquare className="h-5 w-5" />,
  whatsapp: <MessageSquare className="h-5 w-5" />,
  webhook: <Bell className="h-5 w-5" />,
};

const channelColors: Record<ChannelType, string> = {
  email: 'bg-blue-500/10 text-blue-500',
  telegram: 'bg-cyan-500/10 text-cyan-500',
  whatsapp: 'bg-green-500/10 text-green-500',
  webhook: 'bg-purple-500/10 text-purple-500',
};

export default function NotificationChannels() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newChannel, setNewChannel] = useState<{
    type: ChannelType;
    name: string;
    config: Record<string, string>;
  }>({
    type: 'email',
    name: '',
    config: {}
  });
  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  // Fetch notification channels
  const { data: channels, isLoading, refetch } = useQuery({
    queryKey: ['notification-channels', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_channels')
        .select('id, tenant_id, channel_type, name, config, is_active, is_verified, created_at')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as NotificationChannel[];
    },
    enabled: !!tenant?.id
  });

  // Create channel mutation
  const createChannelMutation = useMutation({
    mutationFn: async (channel: typeof newChannel) => {
      // Verificar se tenant está carregado
      if (!tenant?.id) {
        throw new Error('Empresa não selecionada');
      }

      // Forçar refresh do session para garantir JWT atualizado com active_tenant_id
      await supabase.auth.refreshSession();

      const { data, error } = await supabase
        .from('notification_channels')
        .insert({
          tenant_id: tenant.id,
          channel_type: channel.type,
          name: channel.name,
          config: channel.config,
          is_verified: false,
          is_active: true
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Canal criado com sucesso');
      setIsAddDialogOpen(false);
      setNewChannel({ type: 'email', name: '', config: {} });
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    },
    onError: (error) => {
      toast.error('Erro ao criar canal: ' + (error as Error).message);
    }
  });

  // Delete channel mutation
  const deleteChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      // V-1068 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('notification_channels')
        .delete()
        .eq('id', channelId)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Canal removido');
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    },
    onError: (error) => {
      toast.error('Erro ao remover canal: ' + (error as Error).message);
    }
  });

  // Toggle channel active status
  const toggleChannelMutation = useMutation({
    mutationFn: async ({ channelId, isActive }: { channelId: string; isActive: boolean }) => {
      // V-1068 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('notification_channels')
        .update({ is_active: isActive })
        .eq('id', channelId)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    }
  });

  // Test channel
  const testChannel = async (channel: NotificationChannel) => {
    setTestingChannel(channel.id);
    try {
      const functionName = `send-${channel.channel_type}-notification`;
      
      // Build payload matching the expected format for each channel type
      let payload: Record<string, unknown> = {
        channel_id: channel.id,
        tenant_id: tenant?.id || '',
        alert: {
          type: 'test',
          severity: 'info',
          title: '✅ Teste de Canal - CyberShield',
          message: 'Este é um teste de notificação. Se você recebeu esta mensagem, o canal está funcionando corretamente!',
          agent_name: 'CyberShield System',
        },
      };

      if (channel.channel_type === 'telegram') {
        const chatId = (channel.config as Record<string, unknown>)?.chat_id || '';
        payload.recipient = String(chatId);
        payload.config = { 
          chat_id: String(chatId),
          bot_token: (channel.config as Record<string, unknown>)?.bot_token || '',
        };
      } else if (channel.channel_type === 'email') {
        payload.recipient = (channel.config as Record<string, unknown>)?.email || '';
        payload.config = channel.config;
      } else if (channel.channel_type === 'whatsapp') {
        payload.recipient = (channel.config as Record<string, unknown>)?.phone || '';
        payload.config = channel.config;
      } else {
        payload.config = channel.config;
      }

      const { data, error: fnError } = await supabase.functions.invoke(functionName, {
        body: payload,
      });
      
      if (fnError) {
        logger.error('Function error:', fnError);
        throw new Error(fnError.message || 'Erro ao chamar função');
      }
      
      if (data && !data.success) {
        throw new Error(data.error || 'Falha no envio');
      }
      
      // V-1068 FIX: Add tenant_id filter
      await supabase
        .from('notification_channels')
        .update({ 
          is_verified: true, 
          verified_at: new Date().toISOString() 
        })
        .eq('id', channel.id)
        .eq('tenant_id', tenant!.id);
      
      toast.success('Teste enviado com sucesso! Canal verificado.');
      refetch();
    } catch (error) {
      logger.error('Test error:', error);
      toast.error('Erro ao testar canal');
    } finally {
      setTestingChannel(null);
    }
  };

  const getConfigFields = (type: ChannelType) => {
    switch (type) {
      case 'email':
        return [
          { key: 'email', label: 'Email', placeholder: 'admin@empresa.com', type: 'email' }
        ];
      case 'telegram':
        return [
          { key: 'chat_id', label: 'Chat ID', placeholder: '-1001234567890', type: 'text' },
          { key: 'bot_token', label: 'Bot Token', placeholder: '123456:ABC-DEF...', type: 'password' }
        ];
      case 'whatsapp':
        return [
          { key: 'phone', label: 'Número (com código)', placeholder: '+5511999999999', type: 'tel' }
        ];
      case 'webhook':
        return [
          { key: 'url', label: 'URL do Webhook', placeholder: 'https://...', type: 'url' },
          { key: 'secret', label: 'Secret (opcional)', placeholder: 'secret_key', type: 'password' }
        ];
      default:
        return [];
    }
  };

  const verifiedCount = channels?.filter(c => c.is_verified).length || 0;
  const activeCount = channels?.filter(c => c.is_active).length || 0;

  return (
    <AdminPageLayout
      title="Canais de Notificação"
      description="Configure canais para receber alertas de segurança em tempo real"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{channels?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Total de Canais</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{verifiedCount}</p>
                <p className="text-sm text-muted-foreground">Verificados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Send className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-sm text-muted-foreground">Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Canais Configurados
            </CardTitle>
            <CardDescription>
              Gerencie os canais onde você receberá alertas de segurança
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Canal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Canal de Notificação</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Tipo de Canal</Label>
                  <Select 
                    value={newChannel.type} 
                    onValueChange={(v) => setNewChannel({ ...newChannel, type: v as ChannelType, config: {} })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" /> Email
                        </div>
                      </SelectItem>
                      <SelectItem value="telegram">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" /> Telegram
                        </div>
                      </SelectItem>
                      <SelectItem value="whatsapp">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" /> WhatsApp
                        </div>
                      </SelectItem>
                      <SelectItem value="webhook">
                        <div className="flex items-center gap-2">
                          <Bell className="h-4 w-4" /> Webhook
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Nome do Canal</Label>
                  <Input 
                    placeholder="Ex: Email Principal, Telegram TI..."
                    value={newChannel.name}
                    onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                  />
                </div>

                {getConfigFields(newChannel.type).map(field => (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Input 
                      type={field.type}
                      placeholder={field.placeholder}
                      value={newChannel.config[field.key] || ''}
                      onChange={(e) => setNewChannel({ 
                        ...newChannel, 
                        config: { ...newChannel.config, [field.key]: e.target.value }
                      })}
                    />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={() => createChannelMutation.mutate(newChannel)}
                  disabled={!newChannel.name || createChannelMutation.isPending}
                >
                  {createChannelMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Criar Canal
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : channels && channels.length > 0 ? (
            <div className="space-y-3">
              {channels.map((channel) => (
                <div 
                  key={channel.id} 
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${channelColors[channel.channel_type as ChannelType]}`}>
                      {channelIcons[channel.channel_type as ChannelType]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{channel.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {channel.channel_type}
                        </Badge>
                        {channel.is_verified ? (
                          <Badge variant="default" className="text-xs bg-green-500">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verificado
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <XCircle className="h-3 w-3 mr-1" />
                            Não verificado
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {channel.channel_type === 'email' && (channel.config as { email?: string }).email}
                        {channel.channel_type === 'telegram' && `Chat ID: ${(channel.config as { chat_id?: string }).chat_id}`}
                        {channel.channel_type === 'whatsapp' && (channel.config as { phone?: string }).phone}
                        {channel.channel_type === 'webhook' && (channel.config as { url?: string }).url}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch 
                      checked={channel.is_active} 
                      onCheckedChange={(checked) => 
                        toggleChannelMutation.mutate({ channelId: channel.id, isActive: checked })
                      }
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => testChannel(channel)}
                      disabled={testingChannel === channel.id}
                    >
                      {testingChannel === channel.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Testar
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => deleteChannelMutation.mutate(channel.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="mb-2">Nenhum canal de notificação configurado</p>
              <p className="text-sm mb-4">Configure um canal para receber alertas de segurança em tempo real</p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Primeiro Canal
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tips Card */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Dicas de Configuração</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-blue-500" />
              <span className="font-medium">Email</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Configure um email da equipe de TI ou segurança para receber alertas críticos.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-cyan-500" />
              <span className="font-medium">Telegram</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Crie um bot com @BotFather e adicione-o ao grupo/canal desejado.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-green-500" />
              <span className="font-medium">WhatsApp</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Requer integração com WhatsApp Business API (Twilio, MessageBird, etc).
            </p>
          </div>
          <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-4 w-4 text-purple-500" />
              <span className="font-medium">Webhook</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Integre com sistemas como Slack, Discord, PagerDuty ou seu próprio sistema.
            </p>
          </div>
        </CardContent>
      </Card>
    </AdminPageLayout>
  );
}
