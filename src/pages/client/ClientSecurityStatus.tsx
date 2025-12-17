import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package, 
  ShieldAlert, 
  ShieldCheck,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';

export const ClientSecurityStatus = () => {
  const { tenant } = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ['client-security-status', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      // Software inventory
      const { data: software } = await supabase
        .from('software_inventory')
        .select('id, name, version, publisher, install_count')
        .eq('tenant_id', tenant.id)
        .order('install_count', { ascending: false })
        .limit(20);

      // Vulnerabilities
      const { data: vulnerabilities } = await supabase
        .from('vuln_findings')
        .select('id, cve_id, software_name, severity, cvss_score, description')
        .eq('tenant_id', tenant.id)
        .order('cvss_score', { ascending: false })
        .limit(20);

      // Antivirus status
      const { data: antivirus } = await supabase
        .from('antivirus_status')
        .select('id, agent_id, engine_name, status, last_scan_at, last_update_at, threats_found')
        .eq('tenant_id', tenant.id);

      return {
        software: software || [],
        vulnerabilities: vulnerabilities || [],
        antivirus: antivirus || []
      };
    },
    enabled: !!tenant?.id
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'bg-red-500/10 text-red-600';
      case 'high': return 'bg-orange-500/10 text-orange-600';
      case 'medium': return 'bg-yellow-500/10 text-yellow-600';
      case 'low': return 'bg-green-500/10 text-green-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Status de Segurança</h1>
        <p className="text-muted-foreground">
          Veja o que está instalado e possíveis vulnerabilidades
        </p>
      </div>

      <Tabs defaultValue="software" className="space-y-4">
        <TabsList>
          <TabsTrigger value="software" className="gap-2">
            <Package className="h-4 w-4" />
            Programas
          </TabsTrigger>
          <TabsTrigger value="vulnerabilities" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            Vulnerabilidades
          </TabsTrigger>
          <TabsTrigger value="antivirus" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Antivírus
          </TabsTrigger>
        </TabsList>

        <TabsContent value="software">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Programas Instalados</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.software && data.software.length > 0 ? (
                <div className="space-y-2">
                  {data.software.map((sw: any) => (
                    <div 
                      key={sw.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{sw.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {sw.publisher && `${sw.publisher} • `}
                          {sw.version}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {sw.install_count || 1} máquina(s)
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum programa inventariado ainda
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vulnerabilities">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vulnerabilidades Detectadas</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.vulnerabilities && data.vulnerabilities.length > 0 ? (
                <div className="space-y-2">
                  {data.vulnerabilities.map((vuln: any) => (
                    <div 
                      key={vuln.id}
                      className="p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <span className="font-medium">{vuln.cve_id}</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge className={getSeverityColor(vuln.severity)}>
                            {vuln.severity}
                          </Badge>
                          {vuln.cvss_score && (
                            <Badge variant="outline">
                              CVSS: {vuln.cvss_score}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {vuln.software_name}
                      </p>
                      {vuln.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {vuln.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Nenhuma vulnerabilidade encontrada
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="antivirus">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status do Antivírus</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.antivirus && data.antivirus.length > 0 ? (
                <div className="space-y-2">
                  {data.antivirus.map((av: any) => (
                    <div 
                      key={av.id}
                      className="p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-green-500" />
                          <span className="font-medium">{av.engine_name}</span>
                        </div>
                        <Badge 
                          variant={av.status === 'enabled' ? 'default' : 'destructive'}
                          className={av.status === 'enabled' ? 'bg-green-500/10 text-green-600' : ''}
                        >
                          {av.status === 'enabled' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        {av.last_scan_at && (
                          <p>Última verificação: {formatBrazilDateTime(av.last_scan_at)}</p>
                        )}
                        {av.last_update_at && (
                          <p>Última atualização: {formatBrazilDateTime(av.last_update_at)}</p>
                        )}
                      </div>
                      {(av.threats_found || 0) > 0 && (
                        <Badge variant="destructive" className="mt-2">
                          {av.threats_found} ameaça(s) encontrada(s)
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum antivírus detectado
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
