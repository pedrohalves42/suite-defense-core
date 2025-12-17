import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  FileText, 
  Download,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';

export const ClientReports = () => {
  const { tenant } = useTenant();

  const { data: reports, isLoading } = useQuery({
    queryKey: ['client-reports', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('generated_reports')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id
  });

  const getRiskBadge = (score: number | null) => {
    if (score === null) return null;
    if (score >= 60) return <Badge variant="destructive">Alto Risco</Badge>;
    if (score >= 30) return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">Risco Médio</Badge>;
    return <Badge variant="default" className="bg-green-500/10 text-green-600">Baixo Risco</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meus Relatórios</h1>
        <p className="text-muted-foreground">
          Relatórios de segurança dos seus computadores
        </p>
      </div>

      {reports && reports.length > 0 ? (
        <div className="space-y-4">
          {reports.map((report: any) => (
            <Card key={report.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">{report.title}</h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatBrazilDateTime(report.created_at)}
                      </div>
                      {report.agent_name && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Computador: {report.agent_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getRiskBadge(report.risk_score)}
                    {report.file_url && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        asChild
                      >
                        <a href={report.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4 mr-2" />
                          Baixar
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum relatório ainda</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Relatórios de segurança serão gerados automaticamente após as análises dos seus computadores.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
