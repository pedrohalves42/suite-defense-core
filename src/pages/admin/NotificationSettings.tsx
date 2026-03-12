import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveTenant } from '@/hooks/useActiveTenant';
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
import { formatBrazilDateTime } from '@/lib/date-utils';
import { 
  Bell, 
  Mail, 
  MessageCircle, 
  Send, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  Clock,
  History,
  Loader2,
  RefreshCw,
  Calendar,
  FileText,
  X
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

interface ScheduledReport {
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

const DAY_OF_WEEK_OPTIONS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' }
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, '0')}:00`
}));

export default function NotificationSettings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  // ADR-VELLUM V-103: Use centralized tenant hook instead of local fetch
  const { activeTenant, loading: tenantLoading, isFetched } = useActiveTenant();
  const tenantId = activeTenant?.id || null;
  
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({
    type: 'email' as 'whatsapp' | 'telegram' | 'email',
    name: '',
    config: {} as Record<string, string>
  });
  
  // Scheduled Reports State
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');
  const [sendingReport, setSendingReport] = useState<string | null>(null);
  const [newReport, setNewReport] = useState({
    name: 'Relatório Semanal de Segurança',
    schedule: 'weekly',
    day_of_week: 1,
    hour: 9,
    recipients: [] as string[],
    include_software_inventory: true,
    include_vulnerabilities: true,
    include_web_activity: true,
    include_antivirus: true,
    include_agents_summary: true,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  // ADR-VELLUM V-103: Removed vulnerable fetchTenantId - using useActiveTenant hook
  // Guard - only fetch when tenant is fully synchronized
  useEffect(() => {
    if (!tenantLoading && isFetched && tenantId) {
      fetchData();
    }
  }, [tenantId, tenantLoading, isFetched]);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    try {
      const [channelsRes, logsRes, reportsRes] = await Promise.all([
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
          .limit(50),
        supabase
          .from('scheduled_reports')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
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

      if (reportsRes.data) {
        setScheduledReports(reportsRes.data as ScheduledReport[]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

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
      // V-1067 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('notification_channels')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

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
      // V-1067 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('notification_channels')
        .update({ is_active: isActive })
        .eq('id', id)
        .eq('tenant_id', tenantId);

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

  // Scheduled Reports handlers
  const handleAddReport = async () => {
    if (!tenantId) return;
    if (newReport.recipients.length === 0) {
      toast.error('Adicione pelo menos um destinatário');
      return;
    }

    try {
      // Calculate next_send_at
      const now = new Date();
      const nextSend = new Date(now);
      nextSend.setHours(newReport.hour + 3, 0, 0, 0); // Convert to UTC
      
      if (newReport.schedule === 'weekly') {
        const currentDay = now.getDay();
        let daysUntil = newReport.day_of_week - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        nextSend.setDate(nextSend.getDate() + daysUntil);
      } else if (nextSend <= now) {
        nextSend.setDate(nextSend.getDate() + 1);
      }

      const { error } = await supabase
        .from('scheduled_reports')
        .insert({
          tenant_id: tenantId,
          ...newReport,
          next_send_at: nextSend.toISOString(),
          is_active: true,
          created_by: user?.id
        });

      if (error) throw error;

      toast.success('Relatório agendado com sucesso!');
      setReportDialogOpen(false);
      setNewReport({
        name: 'Relatório Semanal de Segurança',
        schedule: 'weekly',
        day_of_week: 1,
        hour: 9,
        recipients: [],
        include_software_inventory: true,
        include_vulnerabilities: true,
        include_web_activity: true,
        include_antivirus: true,
        include_agents_summary: true,
      });
      fetchData();
    } catch (error) {
      console.error('Error adding report:', error);
      toast.error('Erro ao criar relatório');
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este relatório?')) return;

    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Relatório removido');
      fetchData();
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Erro ao remover relatório');
    }
  };

  const handleToggleReport = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;

      setScheduledReports(prev => prev.map(r => r.id === id ? { ...r, is_active: isActive } : r));
      toast.success(isActive ? 'Relatório ativado' : 'Relatório desativado');
    } catch (error) {
      console.error('Error toggling report:', error);
      toast.error('Erro ao atualizar relatório');
    }
  };

  const handleSendReportNow = async (report: ScheduledReport) => {
    setSendingReport(report.id);
    try {
      toast.info('Enviando relatório...');
      
      const { error } = await supabase.functions.invoke('send-scheduled-report', {
        body: {
          report_id: report.id,
          tenant_id: tenantId
        }
      });

      if (error) throw error;
      toast.success('Relatório enviado com sucesso!');
      fetchData();
    } catch (error) {
      console.error('Error sending report:', error);
      toast.error('Erro ao enviar relatório');
    } finally {
      setSendingReport(null);
    }
  };

  const addRecipient = () => {
    if (!newRecipient || !newRecipient.includes('@')) {
      toast.error('Digite um email válido');
      return;
    }
    if (newReport.recipients.includes(newRecipient)) {
      toast.error('Este email já foi adicionado');
      return;
    }
    setNewReport(prev => ({
      ...prev,
      recipients: [...prev.recipients, newRecipient]
    }));
    setNewRecipient('');
  };

  const removeRecipient = (email: string) => {
    setNewReport(prev => ({
      ...prev,
      recipients: prev.recipients.filter(r => r !== email)
    }));
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
            <TabsTrigger value="reports">
              <Calendar className="h-4 w-4 mr-2" />
              Relatórios ({scheduledReports.length})
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
                  
                  // Get last delivery status from logs
                  const channelLogs = logs.filter(l => l.channel_type === channel.channel_type).slice(0, 10);
                  const lastDelivery = channelLogs[0];
                  const last24hLogs = channelLogs.filter(l => {
                    const logTime = new Date(l.created_at).getTime();
                    return Date.now() - logTime < 24 * 60 * 60 * 1000;
                  });
                  const successRate = last24hLogs.length > 0 
                    ? Math.round((last24hLogs.filter(l => l.status === 'sent').length / last24hLogs.length) * 100)
                    : null;
                  
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
                        {/* Delivery Status Inline */}
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

          <TabsContent value="reports" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Relatório
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Agendar Relatório</DialogTitle>
                    <DialogDescription>
                      Configure um relatório automático de segurança por email.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                      <Label>Nome do Relatório</Label>
                      <Input 
                        value={newReport.name}
                        onChange={(e) => setNewReport(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Frequência</Label>
                        <Select value={newReport.schedule} onValueChange={(v) => setNewReport(prev => ({ ...prev, schedule: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Diário</SelectItem>
                            <SelectItem value="weekly">Semanal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {newReport.schedule === 'weekly' && (
                        <div className="space-y-2">
                          <Label>Dia</Label>
                          <Select value={String(newReport.day_of_week)} onValueChange={(v) => setNewReport(prev => ({ ...prev, day_of_week: parseInt(v) }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DAY_OF_WEEK_OPTIONS.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Horário</Label>
                        <Select value={String(newReport.hour)} onValueChange={(v) => setNewReport(prev => ({ ...prev, hour: parseInt(v) }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {HOUR_OPTIONS.map(h => <SelectItem key={h.value} value={String(h.value)}>{h.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Destinatários</Label>
                      <div className="flex gap-2">
                        <Input placeholder="email@exemplo.com" value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())} />
                        <Button type="button" onClick={addRecipient}>Adicionar</Button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {newReport.recipients.map(r => (
                          <Badge key={r} variant="secondary" className="gap-1">
                            {r}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => removeRecipient(r)} />
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Incluir no Relatório</Label>
                      <div className="space-y-2">
                        {[
                          { key: 'include_agents_summary', label: '🖥️ Status dos Computadores' },
                          { key: 'include_vulnerabilities', label: '🔴 Vulnerabilidades' },
                          { key: 'include_software_inventory', label: '📦 Inventário de Software' },
                          { key: 'include_web_activity', label: '🌐 Atividade Web' },
                          { key: 'include_antivirus', label: '🛡️ Status Antivírus' },
                        ].map(item => (
                          <div key={item.key} className="flex items-center gap-2">
                            <Checkbox checked={newReport[item.key as keyof typeof newReport] as boolean} onCheckedChange={(c) => setNewReport(prev => ({ ...prev, [item.key]: c }))} />
                            <Label className="font-normal">{item.label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setReportDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleAddReport}>Criar Relatório</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {scheduledReports.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhum relatório agendado</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Configure relatórios automáticos de segurança por email.
                  </p>
                  <Button onClick={() => setReportDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Relatório
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {scheduledReports.map((report) => (
                  <Card key={report.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{report.name}</CardTitle>
                            <CardDescription>
                              {report.schedule === 'weekly' ? `Semanal - ${DAY_OF_WEEK_OPTIONS.find(d => d.value === report.day_of_week)?.label}` : 'Diário'} às {report.hour}:00
                            </CardDescription>
                          </div>
                        </div>
                        <Switch checked={report.is_active} onCheckedChange={(c) => handleToggleReport(report.id, c)} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        <strong>Destinatários:</strong> {report.recipients.join(', ')}
                      </div>
                      {report.last_sent_at && (
                        <div className="text-xs text-muted-foreground">
                          Último envio: {formatBrazilDateTime(report.last_sent_at, 'short')}
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => handleSendReportNow(report)} disabled={sendingReport === report.id}>
                          {sendingReport === report.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                          Enviar Agora
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteReport(report.id)}>
                          <Trash2 className="h-3 w-3 mr-1" />
                          Remover
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
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
                              {formatBrazilDateTime(log.created_at, 'short')}
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
