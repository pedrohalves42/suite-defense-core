import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, ShieldX, Calendar, Clock, AlertTriangle, CheckCircle, FileText, Building2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface ReportData {
  id: string;
  title: string;
  risk_score: number | null;
  risk_level: string | null;
  status: string | null;
  created_at: string | null;
  expires_at: string | null;
  agent_name: string | null;
  report_type: string;
  tenant_id: string;
}

interface TenantData {
  name: string;
}

const VerificarLaudo: React.FC = () => {
  const { laudoId } = useParams<{ laudoId: string }>();
  const [report, setReport] = useState<ReportData | null>(null);
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      if (!laudoId) {
        setError('ID do laudo não fornecido');
        setLoading(false);
        return;
      }

      try {
        // Fetch report (public access for verification)
        const { data: reportData, error: reportError } = await supabase
          .from('generated_reports')
          .select('id, title, risk_score, risk_level, status, created_at, expires_at, agent_name, report_type, tenant_id')
          .eq('id', laudoId)
          .maybeSingle();

        if (reportError) {
          console.error('Error fetching report:', reportError);
          setError('Erro ao buscar laudo');
          setLoading(false);
          return;
        }

        if (!reportData) {
          setError('Laudo não encontrado');
          setLoading(false);
          return;
        }

        setReport(reportData);

        // Fetch tenant name
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', reportData.tenant_id)
          .maybeSingle();

        if (tenantData) {
          setTenant(tenantData);
        }
      } catch (err) {
        console.error('Error:', err);
        setError('Erro ao verificar laudo');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [laudoId]);

  const isExpired = report?.expires_at ? new Date(report.expires_at) < new Date() : false;
  const isValid = report && !isExpired && report.status === 'generated';

  const getRiskColor = (score: number | null) => {
    if (score === null) return 'bg-muted text-muted-foreground';
    if (score >= 70) return 'bg-destructive text-destructive-foreground';
    if (score >= 40) return 'bg-amber-500 text-white';
    return 'bg-green-500 text-white';
  };

  const getRiskLabel = (score: number | null) => {
    if (score === null) return 'Não avaliado';
    if (score >= 70) return 'Alto Risco';
    if (score >= 40) return 'Médio Risco';
    return 'Baixo Risco';
  };

  const truncateHash = (hash: string | null, length: number = 16) => {
    if (!hash) return 'N/A';
    if (hash.length <= length * 2) return hash;
    return `${hash.substring(0, length)}...${hash.substring(hash.length - length)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
            <Skeleton className="h-8 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="w-full max-w-lg border-destructive">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldX className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl text-destructive">Laudo Não Encontrado</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                {error || 'O laudo solicitado não foi encontrado ou não existe.'}
              </p>
              <p className="text-sm text-muted-foreground">
                Verifique se o link está correto ou entre em contato com o suporte.
              </p>
              <Link to="/">
                <Button variant="outline" className="mt-4">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar ao Início
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <Card className={`border-2 ${isValid ? 'border-green-500' : 'border-amber-500'}`}>
          <CardHeader className="text-center pb-2">
            {/* Selo de Autenticidade */}
            <div className={`mx-auto mb-4 w-20 h-20 rounded-full flex items-center justify-center ${isValid ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
              {isValid ? (
                <ShieldCheck className="h-10 w-10 text-green-500" />
              ) : (
                <AlertTriangle className="h-10 w-10 text-amber-500" />
              )}
            </div>
            
            <Badge variant={isValid ? 'default' : 'secondary'} className={`mb-2 ${isValid ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
              {isValid ? 'Laudo Autêntico' : isExpired ? 'Laudo Expirado' : 'Status Pendente'}
            </Badge>
            
            <CardTitle className="text-xl">{report.title}</CardTitle>
            
            {tenant && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-2">
                <Building2 className="h-4 w-4" />
                <span>{tenant.name}</span>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Score de Risco */}
            {report.risk_score !== null && (
              <div className="flex items-center justify-center">
                <div className={`px-6 py-3 rounded-lg ${getRiskColor(report.risk_score)}`}>
                  <div className="text-center">
                    <div className="text-3xl font-bold">{report.risk_score}</div>
                    <div className="text-sm opacity-90">{getRiskLabel(report.risk_score)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Detalhes */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Tipo de Relatório</p>
                  <p className="font-medium capitalize">{report.report_type.replace(/_/g, ' ')}</p>
                </div>
              </div>
              
              {report.agent_name && (
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Computador Analisado</p>
                    <p className="font-medium">{report.agent_name}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Data de Emissão</p>
                  <p className="font-medium">{report.created_at ? formatBrazilDateTime(report.created_at) : 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Válido Até</p>
                  <p className={`font-medium ${isExpired ? 'text-destructive' : ''}`}>
                    {report.expires_at ? formatBrazilDateTime(report.expires_at) : 'Sem expiração'}
                    {isExpired && ' (Expirado)'}
                  </p>
                </div>
              </div>
            </div>

            {/* Certificação */}
            <div className="text-center pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Este documento foi gerado pelo sistema CyberShield e sua autenticidade pode ser verificada através deste QR Code.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                ID: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{report.id}</code>
              </p>
            </div>

            <Link to="/" className="block">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao Início
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          © {new Date().getFullYear()} CyberShield - Proteção Inteligente para Seus Endpoints
        </p>
      </motion.div>
    </div>
  );
};

export default VerificarLaudo;
