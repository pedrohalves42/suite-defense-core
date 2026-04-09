import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { Navigate } from 'react-router-dom';
import { 
  Gift, 
  Building2, 
  Mail, 
  Calendar, 
  User, 
  Clock, 
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  RefreshCw
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface CustomTrial {
  id: string;
  tenant_id: string;
  email: string;
  company_name: string;
  contact_name: string | null;
  trial_days: number;
  trial_start: string;
  trial_end: string;
  created_by: string;
  status: 'active' | 'expired' | 'converted' | 'cancelled';
  notes: string | null;
  created_at: string;
}

export default function CustomTrials() {
  const { isSuperAdmin, loading: superAdminLoading } = useSuperAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    email: '',
    company_name: '',
    contact_name: '',
    trial_days: 45,
    notes: '',
  });
  
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);

  // Fetch existing trials
  const { data: trials, isLoading: trialsLoading, refetch } = useQuery({
    queryKey: ['custom-trials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_trials')
        .select('id, tenant_id, email, company_name, contact_name, trial_days, trial_start, trial_end, created_by, status, notes, created_at')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CustomTrial[];
    },
    enabled: isSuperAdmin,
  });

  // Create trial mutation
  const createTrialMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: result, error } = await supabase.functions.invoke('create-custom-trial', {
        body: data,
      });
      
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      toast({
        title: 'Trial criado com sucesso!',
        description: `Trial de ${result.trial_days} dias criado para ${result.company_name}`,
      });
      
      setCreatedCredentials({
        email: result.email,
        password: result.temp_password,
      });
      
      setFormData({
        email: '',
        company_name: '',
        contact_name: '',
        trial_days: 45,
        notes: '',
      });
      
      queryClient.invalidateQueries({ queryKey: ['custom-trials'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar trial',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTrialMutation.mutate(formData);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Ativo</Badge>;
      case 'expired':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Expirado</Badge>;
      case 'converted':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Convertido</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (superAdminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <AdminPageLayout
      title="Trials Customizados"
      description="Crie e gerencie trials especiais para clientes VIP"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Criar Novo Trial
            </CardTitle>
            <CardDescription>
              Crie um trial com duração personalizada para clientes especiais
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Nome da Empresa *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company_name"
                    placeholder="Empresa LTDA"
                    className="pl-10"
                    value={formData.company_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email do Cliente *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="cliente@empresa.com"
                    className="pl-10"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_name">Nome do Contato</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="contact_name"
                    placeholder="João Silva"
                    className="pl-10"
                    value={formData.contact_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trial_days">Duração do Trial (dias) *</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="trial_days"
                    type="number"
                    min={1}
                    max={365}
                    className="pl-10"
                    value={formData.trial_days}
                    onChange={(e) => setFormData(prev => ({ ...prev, trial_days: parseInt(e.target.value) || 45 }))}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">Padrão: 45 dias. Máximo: 365 dias.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  placeholder="Notas internas sobre este cliente..."
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={createTrialMutation.isPending}
              >
                {createTrialMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Gift className="mr-2 h-4 w-4" />
                    Criar Trial de {formData.trial_days} Dias
                  </>
                )}
              </Button>
            </form>

            {/* Created Credentials */}
            {createdCredentials && (
              <Card className="mt-4 border-green-500/30 bg-green-500/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Credenciais Criadas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Email:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm">{createdCredentials.email}</code>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(createdCredentials.email)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Senha:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm">{createdCredentials.password}</code>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(createdCredentials.password)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    ⚠️ Envie estas credenciais para o cliente de forma segura.
                  </p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Trials List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Trials Criados
                </CardTitle>
                <CardDescription>
                  Histórico de trials especiais
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {trialsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : trials && trials.length > 0 ? (
              <div className="space-y-3">
                {trials.map((trial) => (
                  <div 
                    key={trial.id} 
                    className="p-3 rounded-lg border bg-card/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{trial.company_name}</span>
                      {getStatusBadge(trial.status)}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        {trial.email}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {trial.trial_days} dias ({formatBrazilDateTime(trial.trial_start, 'date')} - {formatBrazilDateTime(trial.trial_end, 'date')})
                      </div>
                      {trial.notes && (
                        <div className="text-xs italic mt-1">
                          "{trial.notes}"
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Gift className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum trial especial criado ainda</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diagnostic Script Card */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Script de Diagnóstico</CardTitle>
          <CardDescription>
            Use este comando no cliente para diagnosticar problemas de instalação
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm">
            <code>irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-diagnostic-script | iex</code>
          </div>
          <Button 
            variant="outline" 
            className="mt-3"
            onClick={() => copyToClipboard('irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-diagnostic-script | iex')}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copiar Comando
          </Button>
        </CardContent>
      </Card>
    </AdminPageLayout>
  );
}
