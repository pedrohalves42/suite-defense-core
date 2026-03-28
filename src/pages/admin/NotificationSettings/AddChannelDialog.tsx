import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ChannelType } from './types';
import type { NewChannelState } from './useNotificationSettings';

interface AddChannelDialogProps {
  onAdd: (channel: NewChannelState) => Promise<boolean>;
}

export default function AddChannelDialog({ onAdd }: AddChannelDialogProps) {
  const [open, setOpen] = useState(false);
  const [newChannel, setNewChannel] = useState<NewChannelState>({
    type: 'email',
    name: '',
    config: {}
  });

  const handleAdd = async () => {
    const success = await onAdd(newChannel);
    if (success) {
      setOpen(false);
      setNewChannel({ type: 'email', name: '', config: {} });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
              onValueChange={(v: ChannelType) => setNewChannel(prev => ({ ...prev, type: v, config: {} }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
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
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleAdd}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
