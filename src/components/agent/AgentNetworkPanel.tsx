/**
 * AgentNetworkPanel - Displays network info and open ports
 */
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Globe, 
  Shield, 
  ShieldCheck, 
  ShieldX, 
  Network, 
  Wifi,
  Clock,
  Server
} from 'lucide-react';
import { useAgentNetworkInfo } from '@/hooks/useAgentNetworkInfo';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';

interface AgentNetworkPanelProps {
  agentId: string;
}

export function AgentNetworkPanel({ agentId }: AgentNetworkPanelProps) {
  const { data, isLoading, isError } = useAgentNetworkInfo(agentId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-center py-8 px-4">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
          <Network className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <h3 className="font-medium text-foreground mb-2">Informações de Rede</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Dados de rede serão exibidos quando disponíveis.
        </p>
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
            Requer coleta de rede ativa no agente
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with timestamp */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {data.collected_at && formatDistanceToNow(new Date(data.collected_at), { addSuffix: true, locale: ptBR })}
        </span>
        {data.public_ip && (
          <Badge variant="outline" className="text-xs">
            IP: {data.public_ip}
          </Badge>
        )}
      </div>

      {/* Firewall Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-500" />
            Firewall
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { label: 'Domínio', value: data.firewall_domain },
            { label: 'Privado', value: data.firewall_private },
            { label: 'Público', value: data.firewall_public },
          ].map((fw) => (
            <div key={fw.label} className="flex items-center justify-between text-sm">
              <span>{fw.label}</span>
              {fw.value === true ? (
                <Badge variant="default" className="text-xs bg-green-600">
                  <ShieldCheck className="h-3 w-3 mr-1" /> Ativo
                </Badge>
              ) : fw.value === false ? (
                <Badge variant="destructive" className="text-xs">
                  <ShieldX className="h-3 w-3 mr-1" /> Inativo
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">N/A</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Open Ports */}
      {data.open_ports.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="h-4 w-4 text-orange-500" />
              Portas Abertas ({data.open_ports.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.open_ports.slice(0, 20).map((port, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-foreground">{port.port}/{port.protocol}</span>
                  <span className="text-muted-foreground truncate ml-2 max-w-[60%] text-right">{port.process}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Network Adapters */}
      {data.network_adapters.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wifi className="h-4 w-4 text-green-500" />
              Adaptadores ({data.network_adapters.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.network_adapters.map((adapter, idx) => (
              <div key={idx} className="p-2 rounded bg-muted/30 border">
                <p className="text-xs font-medium truncate">{adapter.name}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>{adapter.ip_address}</span>
                  <Badge variant={adapter.status === 'Up' ? 'default' : 'secondary'} className="text-[10px]">
                    {adapter.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Connectivity Tests */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-purple-500" />
            Conectividade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>DNS</span>
            {data.dns_test_success === true ? (
              <Badge variant="default" className="text-xs bg-green-600">OK</Badge>
            ) : data.dns_test_success === false ? (
              <Badge variant="destructive" className="text-xs">Falha</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">N/A</Badge>
            )}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>HTTPS</span>
            {data.https_test_success === true ? (
              <Badge variant="default" className="text-xs bg-green-600">OK</Badge>
            ) : data.https_test_success === false ? (
              <Badge variant="destructive" className="text-xs">Falha</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">N/A</Badge>
            )}
          </div>
          {data.gateway_ip && (
            <div className="flex items-center justify-between text-sm">
              <span>Gateway</span>
              <span className="text-xs font-mono text-muted-foreground">{data.gateway_ip}</span>
            </div>
          )}
          {data.dns_servers.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              DNS: {data.dns_servers.join(', ')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
