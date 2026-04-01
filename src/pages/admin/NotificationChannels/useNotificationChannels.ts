import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import type { NotificationChannel, ChannelType } from './types';

export interface NewChannelState {
  type: ChannelType;
  name: string;
  config: Record<string, string>;
}

export function useNotificationChannels() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [newChannel, setNewChannel] = useState<NewChannelState>({
    type: 'email',
    name: '',
    config: {},
  });

  const queryKey = ['notification-channels', tenant?.id];

  const { data: channels, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_channels')
        .select('id, tenant_id, channel_type, name, config, is_active, is_verified, created_at')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as NotificationChannel[];
    },
    enabled: !!tenant?.id,
  });

  const createChannelMutation = useMutation({
    mutationFn: async (channel: NewChannelState) => {
      if (!tenant?.id) throw new Error('Empresa não selecionada');
      await supabase.auth.refreshSession();
      const { data, error } = await supabase
        .from('notification_channels')
        .insert({
          tenant_id: tenant.id,
          channel_type: channel.type,
          name: channel.name,
          config: channel.config,
          is_verified: false,
          is_active: true,
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
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error('Erro ao criar canal: ' + (error as Error).message);
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      const { error } = await supabase
        .from('notification_channels')
        .delete()
        .eq('id', channelId)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Canal removido');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error('Erro ao remover canal: ' + (error as Error).message);
    },
  });

  const toggleChannelMutation = useMutation({
    mutationFn: async ({ channelId, isActive }: { channelId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('notification_channels')
        .update({ is_active: isActive })
        .eq('id', channelId)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const testChannel = async (channel: NotificationChannel) => {
    setTestingChannel(channel.id);
    try {
      const functionName = `send-${channel.channel_type}-notification`;
      const cfg = channel.config;
      const basePayload: Record<string, unknown> = {
        channel_id: channel.id,
        tenant_id: tenant?.id || '',
        alert: {
          type: 'test',
          severity: 'info',
          title: '✅ Teste de Canal - CyberShield',
          message: 'Este é um teste de notificação. Se você recebeu esta mensagem, o canal está funcionando corretamente!',
          agent_name: 'CyberShield System',
        },
        recipient: '',
        config: cfg as Record<string, string>,
      };

      if (channel.channel_type === 'telegram') {
        const chatId = cfg?.chat_id || '';
        basePayload.recipient = String(chatId);
        basePayload.config = { chat_id: String(chatId), bot_token: cfg?.bot_token || '' };
      } else if (channel.channel_type === 'email') {
        basePayload.recipient = cfg?.email || '';
      } else if (channel.channel_type === 'whatsapp') {
        basePayload.recipient = cfg?.phone || '';
      }

      const { data, error: fnError } = await supabase.functions.invoke(functionName, {
        body: basePayload,
      });

      if (fnError) {
        logger.error('Function error:', fnError);
        throw new Error(fnError.message || 'Erro ao chamar função');
      }
      if (data && !data.success) {
        throw new Error(data.error || 'Falha no envio');
      }

      await supabase
        .from('notification_channels')
        .update({ is_verified: true, verified_at: new Date().toISOString() })
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

  const verifiedCount = channels?.filter(c => c.is_verified).length || 0;
  const activeCount = channels?.filter(c => c.is_active).length || 0;

  return {
    channels,
    isLoading,
    isAddDialogOpen,
    setIsAddDialogOpen,
    newChannel,
    setNewChannel,
    testingChannel,
    verifiedCount,
    activeCount,
    createChannelMutation,
    deleteChannelMutation,
    toggleChannelMutation,
    testChannel,
  };
}
