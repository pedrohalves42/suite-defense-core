import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, Calendar, History, Plus, RefreshCw, Loader2 } from 'lucide-react';
import { useNotificationSettings } from './useNotificationSettings';
import AddChannelDialog from './AddChannelDialog';
import ChannelCard from './ChannelCard';
import ScheduledReportsTab from './ScheduledReportsTab';
import NotificationHistoryTab from './NotificationHistoryTab';

export default function NotificationSettings() {
  const navigate = useNavigate();
  const {
    user,
    authLoading,
    tenantId,
    tenantLoading,
    isFetched,
    channels,
    preferences,
    logs,
    scheduledReports,
    loading,
    sendingReport,
    fetchData,
    handleAddChannel,
    handleDeleteChannel,
    handleToggleChannel,
    handleUpdatePreferences,
    handleTestNotification,
    handleAddReport,
    handleDeleteReport,
    handleToggleReport,
    handleSendReportNow,
    DEFAULT_NEW_REPORT,
  } = useNotificationSettings();

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!tenantLoading && isFetched && tenantId) fetchData();
  }, [tenantId, tenantLoading, isFetched, fetchData]);

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
          <p className="text-muted-foreground">Configure alertas via WhatsApp, Telegram e Email</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />Atualizar
          </Button>
          <AddChannelDialog onAdd={handleAddChannel} />
        </div>
      </div>

      <Tabs defaultValue="channels" className="space-y-4">
        <TabsList>
          <TabsTrigger value="channels">
            <Bell className="h-4 w-4 mr-2" />Canais ({channels.length})
          </TabsTrigger>
          <TabsTrigger value="reports">
            <Calendar className="h-4 w-4 mr-2" />Relatórios ({scheduledReports.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />Histórico
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
                <AddChannelDialog onAdd={handleAddChannel} />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {channels.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  preference={preferences.find(p => p.channel_id === channel.id)}
                  logs={logs.filter(l => l.channel_type === channel.channel_type).slice(0, 10)}
                  onToggle={handleToggleChannel}
                  onTest={handleTestNotification}
                  onDelete={handleDeleteChannel}
                  onUpdatePreferences={handleUpdatePreferences}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <ScheduledReportsTab
            reports={scheduledReports}
            sendingReport={sendingReport}
            defaultNewReport={DEFAULT_NEW_REPORT}
            onAdd={handleAddReport}
            onDelete={handleDeleteReport}
            onToggle={handleToggleReport}
            onSendNow={handleSendReportNow}
          />
        </TabsContent>

        <TabsContent value="history">
          <NotificationHistoryTab logs={logs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
