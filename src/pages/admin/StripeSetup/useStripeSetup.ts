import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';

export interface HealthCheckResponse {
  overall_status: 'healthy' | 'degraded' | 'down';
  checks: {
    stripe_api: { status: 'ok' | 'error'; message: string; details?: { account_name: string; country: string } };
    products_configured: {
      status: 'ok' | 'partial' | 'missing';
      details: { starter: { exists: boolean; price_id: string | null }; pro: { exists: boolean; price_id: string | null } };
    };
    webhook_configured: { status: 'ok' | 'warning' | 'missing'; message: string; endpoint_url?: string };
  };
  recommendations: string[];
}

export function useStripeSetup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [isCreatingProducts, setIsCreatingProducts] = useState(false);

  const { data: healthStatus, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['stripe-health-check'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('stripe-health-check');
      if (error) throw error;
      return data as HealthCheckResponse;
    },
    refetchInterval: false,
    refetchOnWindowFocus: true,
    staleTime: 600_000,
  });

  const createProductsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-stripe-products');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Produtos criados com sucesso!', description: 'Os produtos Starter e Pro foram configurados no Stripe.' });
      queryClient.invalidateQueries({ queryKey: ['stripe-health-check'] });
      refetchHealth();
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar produtos', description: error.message, variant: 'destructive' });
    },
  });

  const handleCreateProducts = async () => {
    if (isCreatingProducts) return;
    if (healthStatus?.checks.products_configured.status === 'ok') {
      toast({ title: 'Produtos ja configurados', description: 'Os produtos Starter e Pro ja estao configurados.', variant: 'destructive' });
      return;
    }
    setIsCreatingProducts(true);
    try { await createProductsMutation.mutateAsync(); } finally { setIsCreatingProducts(false); }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!', description: `${label} copiado para a area de transferencia.` });
  };

  const webhookUrl = healthStatus?.checks.webhook_configured.endpoint_url ||
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`;

  return {
    isAdmin, adminLoading, healthStatus, healthLoading, refetchHealth,
    isCreatingProducts, createProductsMutation, handleCreateProducts,
    copyToClipboard, webhookUrl,
  };
}

export function getStatusColor(status: 'healthy' | 'degraded' | 'down') {
  switch (status) {
    case 'healthy': return 'text-green-500 bg-green-500/10 border-green-500/20';
    case 'degraded': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    case 'down': return 'text-red-500 bg-red-500/10 border-red-500/20';
  }
}

export function getStatusIcon(status: 'ok' | 'error' | 'warning' | 'partial' | 'missing') {
  return status;
}
