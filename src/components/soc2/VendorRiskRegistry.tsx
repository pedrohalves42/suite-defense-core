/**
 * Vendor Risk Registry Component
 * Displays registered vendors with risk scores and compliance certifications
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Building2, Shield, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';

interface Vendor {
  id: string;
  vendor_name: string;
  vendor_type: string;
  criticality: string;
  services_provided: string[];
  data_shared: string[];
  compliance_certifications: string[];
  status: string;
  risk_score: number | null;
  next_review_date: string | null;
}

export function VendorRiskRegistry() {
  const { tenant } = useTenant();

  const { data: vendors, isLoading } = useQuery({
    queryKey: ['vendor-risk-registry', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_risk_registry')
        .select('id, tenant_id, vendor_name, vendor_type, criticality, status, risk_score, services_provided, data_shared, compliance_certifications, contract_start_date, contract_end_date, last_review_date, next_review_date, risk_notes, created_at, updated_at')
        .eq('tenant_id', tenant!.id)
        .order('criticality', { ascending: false });
      
      if (error) throw error;
      return data as Vendor[];
    },
    enabled: !!tenant?.id,
  });

  const getCriticalityBadge = (criticality: string) => {
    switch (criticality) {
      case 'critical':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" /> Crítico</Badge>;
      case 'high':
        return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">Alto</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Médio</Badge>;
      case 'low':
        return <Badge variant="secondary">Baixo</Badge>;
      default:
        return <Badge variant="outline">{criticality}</Badge>;
    }
  };

  const getRiskScoreColor = (score: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score <= 25) return 'text-green-500';
    if (score <= 50) return 'text-yellow-500';
    if (score <= 75) return 'text-orange-500';
    return 'text-red-500';
  };

  const criticalVendors = vendors?.filter(v => v.criticality === 'critical').length || 0;
  const totalVendors = vendors?.length || 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Registro de Fornecedores (CC9)
            </CardTitle>
            <CardDescription>
              Avaliação de risco e conformidade de fornecedores críticos
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-lg px-3 py-1">
              {totalVendors} Fornecedores
            </Badge>
            <Badge variant="destructive" className="text-lg px-3 py-1">
              {criticalVendors} Críticos
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {totalVendors > 0 && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-green-500 font-medium">
              Todos os fornecedores críticos estão cadastrados e avaliados
            </span>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Criticidade</TableHead>
              <TableHead>Serviços</TableHead>
              <TableHead>Certificações</TableHead>
              <TableHead>Score de Risco</TableHead>
              <TableHead>Próxima Revisão</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors?.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell className="font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  {vendor.vendor_name}
                </TableCell>
                <TableCell className="capitalize">{vendor.vendor_type}</TableCell>
                <TableCell>{getCriticalityBadge(vendor.criticality)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {vendor.services_provided?.slice(0, 2).map(service => (
                      <Badge key={service} variant="outline" className="text-xs">{service}</Badge>
                    ))}
                    {(vendor.services_provided?.length || 0) > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{vendor.services_provided.length - 2}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {vendor.compliance_certifications?.map(cert => (
                      <Badge key={cert} className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
                        {cert}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={100 - (vendor.risk_score || 0)} className="w-16 h-2" />
                    <span className={`font-mono text-sm ${getRiskScoreColor(vendor.risk_score)}`}>
                      {vendor.risk_score || 0}/100
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {vendor.next_review_date 
                    ? format(new Date(vendor.next_review_date), "dd/MM/yyyy", { locale: ptBR })
                    : '—'
                  }
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
