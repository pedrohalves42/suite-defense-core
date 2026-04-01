import { useState, useEffect, memo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuditLog } from '@/hooks/useAuditLog';
import { subDays } from 'date-fns';

const ITEMS_PER_PAGE = 10;

export function useEnrollmentKeys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canWrite, loading: roleLoading } = useUserRole();
  const { logSensitiveAccess } = useAuditLog();
  const [open, setOpen] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [maxUses, setMaxUses] = useState('1');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);

  const logListView = useCallback(async () => {
    await logSensitiveAccess('enrollment_key', 'list', 'list', {
      page, filter: statusFilter, search: searchTerm || null,
    });
  }, [logSensitiveAccess, page, statusFilter, searchTerm]);

  useEffect(() => { logListView(); }, [logListView]);

  const { data: keys, isLoading } = useQuery({
    queryKey: ['enrollment-keys', page, searchTerm, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('enrollment_keys_safe')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (searchTerm) query = query.or(`description.ilike.%${searchTerm}%,key_masked.ilike.%${searchTerm}%`);
      if (statusFilter !== 'all') query = query.eq('is_active', statusFilter === 'active');

      const { data, error, count } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const creatorIds = [...new Set(data.map(k => k.created_by).filter(Boolean))];
        const { data: profiles } = await supabase
          .from('profiles_public')
          .select('user_id, full_name')
          .in('user_id', creatorIds);
        const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
        const dataWithCreators = data.map(key => ({
          ...key,
          creator_name: key.created_by ? profileMap.get(key.created_by) : null,
        }));
        return { data: dataWithCreators, count };
      }
      return { data, count };
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['enrollment-keys-stats'],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data: allKeys } = await supabase.from('enrollment_keys_safe').select('*');
      const { data: recentKeys } = await supabase.from('enrollment_keys_safe').select('*').gte('created_at', thirtyDaysAgo);
      const { data: usedKeys } = await supabase.from('enrollment_keys_safe').select('*').not('used_at', 'is', null).gte('used_at', thirtyDaysAgo);

      const activeCount = allKeys?.filter(k => k.is_active).length || 0;
      const recentCount = recentKeys?.length || 0;
      const usedCount = usedKeys?.length || 0;
      const totalUses = allKeys?.reduce((sum, k) => sum + k.current_uses, 0) || 0;
      return { activeCount, recentCount, usedCount, totalUses };
    },
  });

  const totalPages = keys?.count ? Math.ceil(keys.count / ITEMS_PER_PAGE) : 0;

  const createKey = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-enrollment-key`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInHours: parseInt(expiresInHours), maxUses: parseInt(maxUses), description }),
      });
      if (!response.ok) throw new Error('Failed to create key');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys'] });
      toast({ title: 'Chave criada com sucesso!' });
      setOpen(false);
      setDescription('');
    },
    onError: () => { toast({ title: 'Erro ao criar chave', variant: 'destructive' }); },
  });

  const revokeKey = useMutation({
    mutationFn: async (key: any) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revoke-enrollment-key`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: key.id }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to revoke key');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys-stats'] });
      toast({ title: 'Chave revogada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao revogar chave', description: error.message, variant: 'destructive' });
    },
  });

  const runManualCleanup = async () => {
    setIsCleaningUp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('cleanup-expired-enrollment-keys', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      toast({ title: 'Limpeza concluida!', description: `${data.deleted_count} chaves expiradas foram removidas.` });
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment-keys-stats'] });
      setShowCleanupDialog(false);
    } catch (error: any) {
      toast({ title: 'Erro ao executar limpeza', description: error.message, variant: 'destructive' });
    } finally {
      setIsCleaningUp(false);
    }
  };

  return {
    canWrite, roleLoading, open, setOpen,
    expiresInHours, setExpiresInHours, maxUses, setMaxUses,
    description, setDescription, page, setPage,
    searchTerm, setSearchTerm, statusFilter, setStatusFilter,
    isCleaningUp, showCleanupDialog, setShowCleanupDialog,
    keys, isLoading, stats, totalPages,
    createKey, revokeKey, runManualCleanup,
  };
}

export const CountdownTimer = memo(({ expiresAt }: { expiresAt: string }) => {
  const [timeRemaining, setTimeRemaining] = useState('');
  const [colorClass, setColorClass] = useState('text-green-600');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const expiry = new Date(expiresAt);
      const diff = expiry.getTime() - now.getTime();
      if (diff <= 0) { setTimeRemaining('Expirado'); setColorClass('text-muted-foreground'); return; }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 12) { setTimeRemaining(`${hours}h ${minutes}m`); setColorClass('text-green-600'); }
      else if (hours >= 1) { setTimeRemaining(`${hours}h ${minutes}m`); setColorClass('text-yellow-600'); }
      else if (minutes > 0) { setTimeRemaining(`${minutes}m`); setColorClass('text-red-600'); }
      else { setTimeRemaining('< 1m'); setColorClass('text-red-600'); }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return <span className={`font-medium ${colorClass}`}>{timeRemaining}</span>;
});
