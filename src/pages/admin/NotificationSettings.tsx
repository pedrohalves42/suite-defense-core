import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { 
  Bell, 
  Mail, 
  MessageCircle, 
  Send, 
  Plus, 
  Trash2, 
  Settings2, 
  CheckCircle2, 
  XCircle,
  Clock,
  History,
  Loader2,
  RefreshCw
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface NotificationChannel {
  id: string;
  tenant_id: string;
  channel_type: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

interface NotificationPreference {
  id: string;
  channel_id: string;
  alert_types: string[];
  severity_filter: string[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  enabled: boolean;
}

interface NotificationLog {
  id: string;
  channel_type: string;
  recipient: string;
  message_preview: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

const CHANNEL_ICONS = {
  whatsapp: MessageCircle,
  telegram: Send,
  email: Mail,
  sms: Bell
};

const CHANNEL_LABELS = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  email: 'Email',
  sms: 'SMS'
};

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Crítico' },
  { value: 'high', label: 'Alto' },
  { value: 'medium', label: 'Médio' },
  { value: 'low', label: 'Baixo' },
  { value: 'info', label: 'Informativo' }
];

const ALERT_TYPE_OPTIONS = [
  { value: 'agent_offline', label: 'Computador Offline' },
  { value: 'high_cpu', label: 'CPU Alta' },
  { value: 'high_memory', label: 'Memória Alta' },
  { value: 'high_disk', label: 'Disco Cheio' },
  { value: 'threat_detected', label: 'Ameaça Detectada' },
  { value: 'vulnerability_found', label: 'Vulnerabilidade Encontrada' },
  { value: 'software_installed', label: 'Software Instalado' },
  { value: 'job_failed', label: 'Tarefa Falhou' }
];

export default function NotificationSettings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({
    type: 'email' as 'whatsapp' | 'telegram' | 'email',
    name: '',
    config: {} as Record<string, string>
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchTenantId();
    }
  }, [user]);

  useEffect(() => {
    if (tenantId) {
      fetchData();
    }
  }, [tenantId]);

  const fetchTenantId = async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user?.id)
      .single();
    
    if (data) {
      setTenantId(data.tenant_id);
    }
  };

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);

    try {
      const [channelsRes, logsRes] = await Promise.all([
        supabase
          .from('notification_channels')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('notification_log')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);

      if (channelsRes.data) {
        setChannels(channelsRes.data);
        
        // Fetch preferences for all channels
        const channelIds = channelsRes.data.map(c => c.id);
        if (channelIds.length > 0) {
          const { data: prefsData } = await supabase
            .from('notification_preferences')
            .select('*')
            .in('channel_id', channelIds);
          
          if (prefsData) {
            setPreferences(prefsData);
          }
        }
      }

      if (logsRes.data) {
        setLogs(logsRes.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!tenantId || !newChannel.name) {
      toast.error('Preencha todos os campos');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notification_channels')
        .insert({
          tenant_id: tenantId,
          channel_type: newChannel.type,
          name: newChannel.name,
          config: newChannel.config,
          is_verified: newChannel.type === 'email', // Email auto-verified
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      // Create default preferences
      await supabase
        .from('notification_preferences')
        .insert({
          tenant_id: tenantId,
          channel_id: data.id,
          alert_types: [],
          severity_filter: ['critical', 'high'],
          enabled: true
        });

      toast.success('Canal adicionado com sucesso!');
      setAddDialogOpen(false);
      setNewChannel({ type: 'email', name: '', config: {} });
      fetchData();
    } catch (error) {
      console.error('Error adding channel:', error);
      toast.error('Erro ao adicionar canal');
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este canal?')) return;

    try {
      const { error } = await supabase
        .from('notification_channels')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Canal removido');
      fetchData();
    } catch (error) {
      console.error('Error deleting channel:', error);
      toast.error('Erro ao remover canal');
    }
  };

  const handleToggleChannel = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('notification_channels')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;

      setChannels(prev => prev.map(c => c.id === id ? { ...c, is_active: isActive } : c));
      toast.success(isActive ? 'Canal ativado' : 'Canal desativado');
    } catch (error) {
      console.error('Error toggling channel:', error);
      toast.error('Erro ao atualizar canal');
    }
  };

  const handleUpdatePreferences = async (channelId: string, updates: Partial<NotificationPreference>) => {
    try {
      const existing = preferences.find(p => p.channel_id === channelId);
      
      if (existing) {
        const { error } = await supabase
          .from('notification_preferences')
          .update(updates)
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('notification_preferences')
          .insert({
            tenant_id: tenantId,
            channel_id: channelId,
            ...updates
          });

        if (error) throw error;
      }

      fetchData();
      toast.success('Preferências salvas');
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast.error('Erro ao salvar preferências');
    }
  };

  const handleTestNotification = async (channel: NotificationChannel) => {
    try {
      toast.info('Enviando notificação de teste...');
      
      const { error } = await supabase.functions.invoke('dispatch-notification', {
        body: {
          tenant_id: tenantId,
          alert_type: 'test',
          severity: 'info',
          title: 'Teste de Notificação',
          message: 'Esta é uma notificação de teste do CyberShield.',
          agent_name: 'Sistema'
        }
      });

      if (error) throw error;
      toast.success('Notificação de teste enviada!');
      fetchData();
    } catch (error) {
      console.error('Error sending test:', error);
      toast.error('Erro ao enviar teste');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Notificações</h1>
            <p className="text-muted-foreground">
              Configure alertas via WhatsApp, Telegram e Email
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Canal
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar Canal de Notificação</DialogTitle>
                  <DialogDescription>
                    Configure um novo canal para receber alertas do sistema.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Tipo de Canal</Label>
                    <Select 
                      value={newChannel.type} 
                      onValueChange={(v) => setNewChannel(prev => ({ ...prev, type: v as any, config: {} }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">📧 Email</SelectItem>
                        <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                        <SelectItem value="telegram">📱 Telegram</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do Canal</Label>
                    <Input 
                      placeholder="Ex: Email Principal, WhatsApp Equipe..."
                      value={newChannel.name}
                      onChange={(e) => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  
                  {newChannel.type === 'email' && (
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input 
                        type="email"
                        placeholder="seu@email.com"
                        value={newChannel.config.email || ''}
                        onChange={(e) => setNewChannel(prev => ({ 
                          ...prev, 
                          config: { ...prev.config, email: e.target.value } 
                        }))}
                      />
                    </div>
                  )}
                  
                  {newChannel.type === 'whatsapp' && (
                    <div className="space-y-2">
                      <Label>Número WhatsApp (com código do país)</Label>
                      <Input 
                        placeholder="+5511999999999"
                        value={newChannel.config.phone || ''}
                        onChange={(e) => setNewChannel(prev => ({ 
                          ...prev, 
                          config: { ...prev.config, phone: e.target.value } 
                        }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Requer configuração do Twilio. Entre em contato com o suporte.
                      </p>
                    </div>
                  )}
                  
                  {newChannel.type === 'telegram' && (
                    <div className="space-y-2">
                      <Label>Chat ID do Telegram</Label>
                      <Input 
                        placeholder="123456789"
                        value={newChannel.config.chat_id || ''}
                        onChange={(e) => setNewChannel(prev => ({ 
                          ...prev, 
                          config: { ...prev.config, chat_id: e.target.value } 
                        }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Inicie uma conversa com @CyberShieldBot para obter seu Chat ID.
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleAddChannel}>
                    Adicionar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="channels" className="space-y-4">
          <TabsList>
            <TabsTrigger value="channels">
              <Bell className="h-4 w-4 mr-2" />
              Canais ({channels.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-2" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="channels" className="space-y-4">
            {channels.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhum canal configurado</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Adicione um canal para começar a receber alertas em tempo real.
                  </p>
                  <Button onClick={() => setAddDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Canal
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {channels.map((channel) => {
                  const Icon = CHANNEL_ICONS[channel.channel_type];
                  const pref = preferences.find(p => p.channel_id === channel.id);
                  
                  return (
                    <Card key={channel.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-lg">{channel.name}</CardTitle>
                              <CardDescription>
                                {CHANNEL_LABELS[channel.channel_type]}
                              </CardDescription>
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
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label>Canal Ativo</Label>
                          <Switch 
                            checked={channel.is_active}
                            onCheckedChange={(checked) => handleToggleChannel(channel.id, checked)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm">Severidades</Label>
                          <div className="flex flex-wrap gap-2">
                            {SEVERITY_OPTIONS.map((sev) => (
                              <Badge 
                                key={sev.value}
                                variant={pref?.severity_filter?.includes(sev.value) ? 'default' : 'outline'}
                                className="cursor-pointer"
                                onClick={() => {
                                  const current = pref?.severity_filter || [];
                                  const updated = current.includes(sev.value)
                                    ? current.filter(s => s !== sev.value)
                                    : [...current, sev.value];
                                  handleUpdatePreferences(channel.id, { severity_filter: updated });
                                }}
                              >
                                {sev.label}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleTestNotification(channel)}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Testar
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteChannel(channel.id)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remover
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Notificações</CardTitle>
                <CardDescription>
                  Últimas 50 notificações enviadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma notificação enviada ainda.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Canal</TableHead>
                        <TableHead>Destinatário</TableHead>
                        <TableHead>Mensagem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => {
                        const Icon = CHANNEL_ICONS[log.channel_type as keyof typeof CHANNEL_ICONS] || Bell;
                        return (
                          <TableRow key={log.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                {CHANNEL_LABELS[log.channel_type as keyof typeof CHANNEL_LABELS] || log.channel_type}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {log.recipient.slice(0, 20)}...
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {log.message_preview}
                            </TableCell>
                            <TableCell>
                              {log.status === 'sent' ? (
                                <Badge variant="outline" className="text-green-600">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Enviado
                                </Badge>
                              ) : log.status === 'failed' ? (
                                <Badge variant="outline" className="text-red-600">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Falhou
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  {log.status}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(log.created_at).toLocaleString('pt-BR')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}
