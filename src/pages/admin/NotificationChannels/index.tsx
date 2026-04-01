import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, MessageSquare, Bell, Plus, CheckCircle, RefreshCw, Send, Settings } from 'lucide-react';
import { useNotificationChannels } from './useNotificationChannels';
import { getConfigFields } from './types';
import type { ChannelType } from './types';
import ChannelListItem from './components/ChannelListItem';
import TipsCard from './components/TipsCard';

export default function NotificationChannels() {
  const {
    channels, isLoading, isAddDialogOpen, setIsAddDialogOpen,
    newChannel, setNewChannel, testingChannel, verifiedCount, activeCount,
    createChannelMutation, deleteChannelMutation, toggleChannelMutation, testChannel,
  } = useNotificationChannels();

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
              <div className="p-2 rounded-lg bg-primary/10"><Bell className="h-5 w-5 text-primary" /></div>
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
              <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle className="h-5 w-5 text-green-500" /></div>
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
              <div className="p-2 rounded-lg bg-blue-500/10"><Send className="h-5 w-5 text-blue-500" /></div>
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
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Canais Configurados</CardTitle>
            <CardDescription>Gerencie os canais onde você receberá alertas de segurança</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Adicionar Canal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Adicionar Canal de Notificação</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Tipo de Canal</Label>
                  <Select value={newChannel.type} onValueChange={(v) => setNewChannel({ ...newChannel, type: v as ChannelType, config: {} })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email"><div className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email</div></SelectItem>
                      <SelectItem value="telegram"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Telegram</div></SelectItem>
                      <SelectItem value="whatsapp"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> WhatsApp</div></SelectItem>
                      <SelectItem value="webhook"><div className="flex items-center gap-2"><Bell className="h-4 w-4" /> Webhook</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nome do Canal</Label>
                  <Input placeholder="Ex: Email Principal, Telegram TI..." value={newChannel.name} onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })} />
                </div>
                {getConfigFields(newChannel.type).map(field => (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Input type={field.type} placeholder={field.placeholder} value={newChannel.config[field.key] || ''} onChange={(e) => setNewChannel({ ...newChannel, config: { ...newChannel.config, [field.key]: e.target.value } })} />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
                <Button onClick={() => createChannelMutation.mutate(newChannel)} disabled={!newChannel.name || createChannelMutation.isPending}>
                  {createChannelMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                  Criar Canal
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : channels && channels.length > 0 ? (
            <div className="space-y-3">
              {channels.map((channel) => (
                <ChannelListItem
                  key={channel.id}
                  channel={channel}
                  testingChannel={testingChannel}
                  onToggle={(p) => toggleChannelMutation.mutate(p)}
                  onTest={testChannel}
                  onDelete={(id) => deleteChannelMutation.mutate(id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="mb-2">Nenhum canal de notificação configurado</p>
              <p className="text-sm mb-4">Configure um canal para receber alertas de segurança em tempo real</p>
              <Button onClick={() => setIsAddDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Adicionar Primeiro Canal</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <TipsCard />
    </AdminPageLayout>
  );
}
