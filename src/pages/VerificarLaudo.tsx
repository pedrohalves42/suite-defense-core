import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ShieldCheck, ShieldX, Calendar, Clock, AlertTriangle, CheckCircle, FileText, 
  Building2, ArrowLeft, Lock, Hash, Fingerprint, Shield 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface IntegrityResult {
  valid: boolean;
  sha256_match?: boolean;
  hmac_valid?: boolean;
  algorithm?: string;
}

interface ReportInfo {
  title: string;
  report_type: string;
  risk_score: number | null;
  risk_level: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
  is_expired: boolean;
  tenant_name: string;
  template?: string;
  template_name?: string;
  period_start?: string;
  period_end?: string;
  statistics?: {
    total_agents?: number;
    total_vulnerabilities?: number;
    critical_vulnerabilities?: number;
    high_vulnerabilities?: number;
    threats_found?: number;
  };
}

interface HashInfo {
  sha256?: string;
  sha256_preview?: string;
}

interface VerificationResponse {
  success: boolean;
  error?: string;
  audit_id?: string;
  report_id?: string;
  integrity: IntegrityResult;
  report?: ReportInfo;
  hashes?: HashInfo;
  verification?: {
    verified_at: string;
    verification_method: string;
    compliance_standards: string[];
  };
}

const VerificarLaudo: React.FC = () => {
  const { laudoId } = useParams<{ laudoId: string }>();
  const [searchParams] = useSearchParams();
  const [verificationResult, setVerificationResult] = useState<VerificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Support both route param and query param
  const actualLaudoId = laudoId || searchParams.get("id");

  useEffect(() => {
    const verifyReport = async () => {
      if (!actualLaudoId) {
        setError('ID do laudo não fornecido');
        setLoading(false);
        return;
      }

      try {
        // Determine if actualLaudoId is a UUID or audit_id
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actualLaudoId);
        
        if (isUUID) {
          // Legacy: fetch by UUID and do basic verification
          const { data: reportData, error: reportError } = await supabase
            .from('generated_reports')
            .select('id, audit_id, title, risk_score, risk_level, status, created_at, expires_at, report_type, tenant_id, sha256, hmac_signature')
            .eq('id', actualLaudoId)
            .maybeSingle();

          if (reportError || !reportData) {
            setError('Laudo não encontrado');
            setLoading(false);
            return;
          }

          // If report has audit_id, redirect to full verification
          if (reportData.audit_id) {
            const { data: funcData, error: funcError } = await supabase.functions.invoke('verify-compliance-report', {
              body: { audit_id: reportData.audit_id }
            });

            if (funcError) {
              console.error('Verification function error:', funcError);
              setError('Erro na verificação de integridade');
              setLoading(false);
              return;
            }

            setVerificationResult(funcData as VerificationResponse);
          } else {
            // Legacy report without audit_id
            const { data: tenantData } = await supabase
              .from('tenants')
              .select('name')
              .eq('id', reportData.tenant_id)
              .maybeSingle();

            setVerificationResult({
              success: true,
              audit_id: reportData.id,
              report_id: reportData.id,
              integrity: {
                valid: false,
                sha256_match: false,
                hmac_valid: false,
                algorithm: 'N/A (legacy report)'
              },
              report: {
                title: reportData.title,
                report_type: reportData.report_type,
                risk_score: reportData.risk_score,
                risk_level: reportData.risk_level,
                status: reportData.status ?? 'unknown',
                created_at: reportData.created_at ?? new Date().toISOString(),
                expires_at: reportData.expires_at,
                is_expired: reportData.expires_at ? new Date(reportData.expires_at) < new Date() : false,
                tenant_name: tenantData?.name ?? 'Unknown',
              },
              hashes: {
                sha256: reportData.sha256 ?? undefined,
                sha256_preview: reportData.sha256 ? reportData.sha256.substring(0, 16) + '...' : 'N/A',
              }
            });
          }
        } else {
          // New format: audit_id (e.g., LAUDO-XXXXXXXX-TIMESTAMP)
          const { data: funcData, error: funcError } = await supabase.functions.invoke('verify-compliance-report', {
            body: { audit_id: actualLaudoId }
          });

          if (funcError) {
            console.error('Verification function error:', funcError);
            setError('Erro na verificação de integridade');
            setLoading(false);
            return;
          }

          const result = funcData as VerificationResponse;
          if (!result.success) {
            setError(result.error || 'Laudo não encontrado');
            setLoading(false);
            return;
          }

          setVerificationResult(result);
        }
      } catch (err) {
        console.error('Error:', err);
        setError('Erro ao verificar laudo');
      } finally {
        setLoading(false);
      }
    };

    verifyReport();
  }, [actualLaudoId]);

  const isExpired = verificationResult?.report?.is_expired ?? false;
  const isIntegrityValid = verificationResult?.integrity?.valid ?? false;
  const isFullyValid = isIntegrityValid && !isExpired && verificationResult?.report?.status === 'generated';

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

  if (error || !verificationResult) {
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

  const report = verificationResult.report;
  const integrity = verificationResult.integrity;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <Card className={`border-2 ${isFullyValid ? 'border-green-500' : isIntegrityValid ? 'border-amber-500' : 'border-destructive'}`}>
          <CardHeader className="text-center pb-2">
            {/* Selo de Autenticidade */}
            <div className={`mx-auto mb-4 w-20 h-20 rounded-full flex items-center justify-center ${
              isFullyValid ? 'bg-green-500/10' : isIntegrityValid ? 'bg-amber-500/10' : 'bg-destructive/10'
            }`}>
              {isFullyValid ? (
                <ShieldCheck className="h-10 w-10 text-green-500" />
              ) : isIntegrityValid ? (
                <AlertTriangle className="h-10 w-10 text-amber-500" />
              ) : (
                <ShieldX className="h-10 w-10 text-destructive" />
              )}
            </div>
            
            <Badge 
              variant={isFullyValid ? 'default' : 'secondary'} 
              className={`mb-2 ${
                isFullyValid ? 'bg-green-500 hover:bg-green-600' : 
                isIntegrityValid ? 'bg-amber-500 hover:bg-amber-600' : 
                'bg-destructive hover:bg-destructive/90'
              }`}
            >
              {isFullyValid ? 'Laudo Autêntico ✓' : 
               isExpired ? 'Laudo Expirado' : 
               isIntegrityValid ? 'Integridade OK (Verificar Status)' :
               'Falha na Verificação'}
            </Badge>
            
            <CardTitle className="text-xl">{report?.title || 'Relatório de Compliance'}</CardTitle>
            
            {report?.tenant_name && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-2">
                <Building2 className="h-4 w-4" />
                <span>{report.tenant_name}</span>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Integridade Criptográfica */}
            <div className={`rounded-lg p-4 ${
              isIntegrityValid ? 'bg-green-500/10 border border-green-500/20' : 'bg-destructive/10 border border-destructive/20'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <Lock className={`h-5 w-5 ${isIntegrityValid ? 'text-green-500' : 'text-destructive'}`} />
                <span className="font-semibold">Verificação Criptográfica</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Hash className={`h-4 w-4 ${integrity?.sha256_match ? 'text-green-500' : 'text-destructive'}`} />
                  <span>SHA256: {integrity?.sha256_match ? '✓ Válido' : '✗ Inválido'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Fingerprint className={`h-4 w-4 ${integrity?.hmac_valid ? 'text-green-500' : 'text-destructive'}`} />
                  <span>HMAC: {integrity?.hmac_valid ? '✓ Válido' : '✗ Inválido'}</span>
                </div>
              </div>
              
              {verificationResult.hashes?.sha256_preview && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground font-mono">
                    Hash: {verificationResult.hashes.sha256_preview}
                  </p>
                </div>
              )}
            </div>

            {/* Score de Risco */}
            {report?.risk_score !== null && report?.risk_score !== undefined && (
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
                  <p className="font-medium">{report?.template_name || report?.report_type?.replace(/_/g, ' ') || 'Compliance'}</p>
                </div>
              </div>
              
              {report?.statistics && (
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Estatísticas</p>
                    <p className="font-medium text-sm">
                      {report.statistics.total_agents ?? 0} agentes • {report.statistics.total_vulnerabilities ?? 0} vulnerabilidades
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Data de Emissão</p>
                  <p className="font-medium">{report?.created_at ? formatBrazilDateTime(report.created_at) : 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Válido Até</p>
                  <p className={`font-medium ${isExpired ? 'text-destructive' : ''}`}>
                    {report?.expires_at ? formatBrazilDateTime(report.expires_at) : 'Sem expiração'}
                    {isExpired && ' (Expirado)'}
                  </p>
                </div>
              </div>
            </div>

            {/* Compliance Standards */}
            {verificationResult.verification?.compliance_standards && (
              <div className="flex items-center justify-center gap-2">
                {verificationResult.verification.compliance_standards.map((standard) => (
                  <Badge key={standard} variant="outline" className="text-xs">
                    {standard}
                  </Badge>
                ))}
              </div>
            )}

            {/* Certificação */}
            <div className="text-center pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Este documento foi verificado criptograficamente pelo sistema CyberShield usando SHA-256 e HMAC-SHA256.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                ID: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{verificationResult.audit_id || actualLaudoId}</code>
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
