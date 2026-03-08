import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ShieldCheck, AlertCircle, Fingerprint } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';

interface ReleaseSignatureInfo {
  id: string;
  version: string;
  platform: string;
  is_active: boolean;
  signature_base64: string | null;
  signed_at: string | null;
  created_at: string;
}

export function ReleaseSignatureStatusCard() {
  const { user } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();

  const { data: releases = [], isLoading } = useQuery({
    queryKey: ['admin-release-signatures', user?.id],
    enabled: !!user && isSuperAdmin,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-admin-releases');
      if (error) throw error;
      return ((data?.releases || []) as ReleaseSignatureInfo[]).filter(r => r.is_active);
    },
  });

  if (!isSuperAdmin) return null;

  const signedCount = releases.filter(r => !!r.signature_base64).length;
  const unsignedCount = releases.filter(r => !r.signature_base64).length;
  const allSigned = releases.length > 0 && unsignedCount === 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card className={allSigned ? 'border-l-4 border-l-success' : 'border-l-4 border-l-destructive'}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Fingerprint className="h-4 w-4 text-muted-foreground" />
          Assinaturas Ed25519 — Releases Ativos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-3">
          <StatusBadge variant={allSigned ? 'healthy' : 'critical'}>
            {allSigned ? 'Todos Assinados' : `${unsignedCount} Sem Assinatura`}
          </StatusBadge>
          <span className="text-xs text-muted-foreground">
            {signedCount}/{releases.length} releases
          </span>
        </div>

        <div className="space-y-1.5">
          {releases.map(r => (
            <div key={r.id} className="flex items-center justify-between py-1 px-2 rounded-md bg-muted/30 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{r.version}</span>
                <span className="text-muted-foreground capitalize">{r.platform}</span>
              </div>
              {r.signature_base64 ? (
                <div className="flex items-center gap-1 text-success">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Assinado</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Sem Assinatura</span>
                </div>
              )}
            </div>
          ))}
          {releases.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Nenhum release ativo encontrado</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
