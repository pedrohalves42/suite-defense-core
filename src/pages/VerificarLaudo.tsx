import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ShieldCheck, ShieldX, Calendar, Clock, AlertTriangle, CheckCircle, FileText, 
  Building2, ArrowLeft, Lock, Hash, Fingerprint, Shield, Monitor, Bug, 
  AlertCircle, Ban, TrendingUp, TrendingDown, Minus, Info, HelpCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { UI_LABELS, getComplianceRiskInfo } from '@/lib/ui-dictionary';
import { logger } from '@/lib/logger';

interface IntegrityResult {
  valid: boolean;
  sha256_match?: boolean;
  hmac_valid?: boolean;
  algorithm?: string;
}

interface ExecutiveSummary {
  title: string;
  overallStatus: string;
  overallMessage: string;
  highlights: Array<{
    icon: string;
    label: string;
    value: string;
    status: string;
  }>;
  recommendations: string[];
}

interface Invariant {
  id: string;
  name: string;
  technicalName?: string;
  status: string;
  description: string;
  laymanDescription?: string;
  details: string;
  laymanDetails?: string;
  evidence_hash: string;
}

interface Statistics {
  total_agents?: number;
  online_agents?: number;
  offline_agents?: number;
  total_vulnerabilities?: number;
  critical_vulnerabilities?: number;
  high_vulnerabilities?: number;
  medium_vulnerabilities?: number;
  low_vulnerabilities?: number;
  threats_found?: number;
  agents_with_av?: number;
  agents_with_active_av?: number;
  av_outdated?: number;
  security_events?: number;
  failed_logins?: number;
  blocked_sites?: number;
  blocked_access_attempts?: number;
  job_success_rate?: number;
}

interface ReportInfo {
  title: string;
  report_type: string;
  risk_score: number | null;
  risk_level: string | null;
  risk_trend?: string;
  risk_layman_description?: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  is_expired: boolean;
  tenant_name: string;
  template?: string;
  template_name?: string;
  template_description?: string;
  period_start?: string;
  period_end?: string;
  statistics?: Statistics;
  executive_summary?: ExecutiveSummary;
  invariants?: Invariant[];
  invariants_summary?: {
    total: number;
    passed: number;
    failed: number;
    warning?: number;
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

  const actualLaudoId = laudoId || searchParams.get("id");

  useEffect(() => {
    const verifyReport = async () => {
      if (!actualLaudoId) {
        setError('ID do laudo não fornecido');
        setLoading(false);
        return;
      }

      try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actualLaudoId);
        
        if (isUUID) {
          const { data: reportData, error: reportError } = await supabase
            .from('generated_reports')
            .select('id, audit_id, title, risk_score, risk_level, status, created_at, expires_at, report_type, tenant_id, sha256, hmac_signature, report_data')
            .eq('id', actualLaudoId)
            .maybeSingle();

          if (reportError || !reportData) {
            setError('Laudo não encontrado');
            setLoading(false);
            return;
          }

          if (reportData.audit_id) {
            const { data: funcData, error: funcError } = await supabase.functions.invoke('verify-compliance-report', {
              body: { audit_id: reportData.audit_id }
            });

            if (funcError) {
              logger.error('Verification function error:', funcError);
              setError('Erro na verificação de integridade');
              setLoading(false);
              return;
            }

            setVerificationResult(funcData as VerificationResponse);
          } else {
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
          const { data: funcData, error: funcError } = await supabase.functions.invoke('verify-compliance-report', {
            body: { audit_id: actualLaudoId }
          });

          if (funcError) {
            logger.error('Verification function error:', funcError);
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
        logger.error('Error:', err);
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

  const getRiskInfo = (level: string | null) => {
    if (!level) return { label: 'Não avaliado', emoji: '❓', description: '' };
    return getComplianceRiskInfo(level);
  };

  const getTrendIcon = (trend?: string) => {
    if (trend === 'subindo') return <TrendingUp className="h-4 w-4 text-destructive" />;
    if (trend === 'descendo') return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getHighlightIcon = (icon: string) => {
    switch (icon) {
      case 'computer': return <Monitor className="h-5 w-5" />;
      case 'shield': return <Shield className="h-5 w-5" />;
      case 'alert': return <AlertCircle className="h-5 w-5" />;
      case 'block': return <Ban className="h-5 w-5" />;
      case 'virus': return <Bug className="h-5 w-5" />;
      case 'offline': return <Monitor className="h-5 w-5" />;
      default: return <Info className="h-5 w-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'good') return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    if (status === 'warning') return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
    return 'text-red-600 bg-red-50 dark:bg-red-900/20';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
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
  const execSummary = report?.executive_summary;
  const stats = report?.statistics;
  const invariants = report?.invariants;
  const riskInfo = getRiskInfo(report?.risk_level ?? null);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 py-8 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-3xl mx-auto space-y-6"
        >
          {/* Main Verification Card */}
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
                className={`mb-2 text-base px-4 py-1 ${
                  isFullyValid ? 'bg-green-500 hover:bg-green-600' : 
                  isIntegrityValid ? 'bg-amber-500 hover:bg-amber-600' : 
                  'bg-destructive hover:bg-destructive/90'
                }`}
              >
                {isFullyValid ? '✓ Documento Autêntico' : 
                 isExpired ? 'Documento Expirado' : 
                 isIntegrityValid ? 'Verificar Status' :
                 'Verificação Falhou'}
              </Badge>
              
              <CardTitle className="text-xl">{report?.title || 'Relatório de Compliance'}</CardTitle>
              
              {report?.tenant_name && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-2">
                  <Building2 className="h-4 w-4" />
                  <span>{report.tenant_name}</span>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Explicação em Linguagem Simples */}
              <div className={`rounded-lg p-4 ${
                isFullyValid ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
                isIntegrityValid ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' :
                'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  O que isso significa?
                </h3>
                <p className="text-sm">
                  {isFullyValid ? (
                    <>
                      <strong>Este documento é autêntico e válido.</strong> Ele foi gerado pelo sistema CyberShield 
                      e não sofreu nenhuma alteração desde sua criação. Você pode confiar nas informações contidas nele.
                    </>
                  ) : isExpired ? (
                    <>
                      <strong>Este documento expirou.</strong> Relatórios de compliance são válidos por 30 dias. 
                      Solicite um novo relatório para obter informações atualizadas.
                    </>
                  ) : isIntegrityValid ? (
                    <>
                      <strong>O documento não foi alterado</strong>, mas há um problema com seu status. 
                      Entre em contato com o suporte para mais informações.
                    </>
                  ) : (
                    <>
                      <strong>Não foi possível verificar a autenticidade deste documento.</strong> 
                      Ele pode ter sido alterado ou corrompido. Não confie nas informações contidas nele.
                    </>
                  )}
                </p>
              </div>

              {/* Verificação Criptográfica - Explicação Simples */}
              <div className={`rounded-lg p-4 ${
                isIntegrityValid ? 'bg-green-500/10 border border-green-500/20' : 'bg-destructive/10 border border-destructive/20'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <Lock className={`h-5 w-5 ${isIntegrityValid ? 'text-green-500' : 'text-destructive'}`} />
                  <span className="font-semibold">Verificação de Autenticidade</span>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Usamos criptografia para garantir que o documento não foi alterado (SHA256) e que foi realmente gerado pelo sistema CyberShield (HMAC).</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className={`flex items-center gap-2 p-2 rounded ${integrity?.sha256_match ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                    <Hash className={`h-4 w-4 ${integrity?.sha256_match ? 'text-green-600' : 'text-destructive'}`} />
                    <span>{integrity?.sha256_match ? '✓ Documento não foi alterado' : '✗ Documento pode ter sido modificado'}</span>
                  </div>
                  <div className={`flex items-center gap-2 p-2 rounded ${integrity?.hmac_valid ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                    <Fingerprint className={`h-4 w-4 ${integrity?.hmac_valid ? 'text-green-600' : 'text-destructive'}`} />
                    <span>{integrity?.hmac_valid ? '✓ Origem confirmada' : '✗ Origem não verificada'}</span>
                  </div>
                </div>
                
                {verificationResult.hashes?.sha256_preview && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs text-muted-foreground font-mono">
                      Impressão digital: {verificationResult.hashes.sha256_preview}
                    </p>
                  </div>
                )}
              </div>

              {/* Score de Risco com Explicação */}
              {report?.risk_score !== null && report?.risk_score !== undefined && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Nível de Risco</span>
                    {report.risk_trend && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {getTrendIcon(report.risk_trend)}
                        <span>{report.risk_trend === 'subindo' ? 'Aumentando' : report.risk_trend === 'descendo' ? 'Diminuindo' : 'Estável'}</span>
                      </div>
                    )}
                  </div>
                  <div className={`rounded-lg p-4 ${getRiskColor(report.risk_score)}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-3xl font-bold">{report.risk_score}/100</div>
                        <div className="text-sm opacity-90">{riskInfo.emoji} {riskInfo.label}</div>
                      </div>
                      <div className="text-right max-w-[200px]">
                        <p className="text-sm opacity-90">{riskInfo.description}</p>
                      </div>
                    </div>
                  </div>
                  {report.risk_layman_description && (
                    <p className="text-sm text-muted-foreground">{report.risk_layman_description}</p>
                  )}
                </div>
              )}

              {/* Datas */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Emitido em</p>
                    <p className="font-medium">{report?.created_at ? formatBrazilDateTime(report.created_at) : 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Válido até</p>
                    <p className={`font-medium ${isExpired ? 'text-destructive' : ''}`}>
                      {report?.expires_at ? formatBrazilDateTime(report.expires_at) : 'Sem expiração'}
                      {isExpired && ' (Expirado)'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Executive Summary Card */}
          {execSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" />
                  {execSummary.title || 'Resumo Executivo'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">{execSummary.overallMessage}</p>

                {/* Highlights */}
                {execSummary.highlights && execSummary.highlights.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {execSummary.highlights.map((highlight, idx) => (
                      <div key={idx} className={`rounded-lg p-3 ${getStatusColor(highlight.status)}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {getHighlightIcon(highlight.icon)}
                          <span className="text-xs font-medium">{highlight.label}</span>
                        </div>
                        <p className="text-lg font-bold">{highlight.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommendations */}
                {execSummary.recommendations && execSummary.recommendations.length > 0 && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Recomendações
                    </h4>
                    <ul className="space-y-1">
                      {execSummary.recommendations.map((rec, idx) => (
                        <li key={idx} className="text-sm flex items-start gap-2">
                          <span className="text-muted-foreground">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Statistics Card */}
          {stats && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Monitor className="h-5 w-5" />
                  Estatísticas do Período
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold">{stats.total_agents ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Computadores</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold">{stats.online_agents ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Online</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-amber-600">{stats.total_vulnerabilities ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Vulnerabilidades</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{stats.agents_with_active_av ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Com Antivírus</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invariants Accordion */}
          {invariants && invariants.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5" />
                  Verificações de Segurança
                  <Badge variant="outline" className="ml-2">
                    {report?.invariants_summary?.passed ?? 0}/{report?.invariants_summary?.total ?? 0} OK
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {invariants.map((inv) => (
                    <AccordionItem key={inv.id} value={inv.id}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          {inv.status === 'PASS' ? (
                            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                          ) : inv.status === 'WARN' ? (
                            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                          ) : (
                            <ShieldX className="h-5 w-5 text-destructive shrink-0" />
                          )}
                          <div className="text-left">
                            <p className="font-medium">{inv.name}</p>
                            <p className="text-xs text-muted-foreground">{inv.laymanDescription || inv.description}</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pl-8 space-y-2">
                          <p className="text-sm">{inv.laymanDetails || inv.details}</p>
                          <p className="text-xs text-muted-foreground">
                            ID técnico: {inv.id} • Hash: {inv.evidence_hash.substring(0, 12)}...
                          </p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* Compliance Standards */}
          {verificationResult.verification?.compliance_standards && (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {verificationResult.verification.compliance_standards.map((standard) => (
                <Badge key={standard} variant="outline" className="text-xs">
                  {standard}
                </Badge>
              ))}
            </div>
          )}

          {/* Certificação */}
          <div className="text-center pt-4">
            <p className="text-xs text-muted-foreground">
              Este documento foi verificado criptograficamente pelo sistema CyberShield.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ID: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{verificationResult.audit_id || actualLaudoId}</code>
            </p>
          </div>

          <Link to="/" className="block">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Início
            </Button>
          </Link>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} CyberShield - Proteção Inteligente para Seus Endpoints
          </p>
        </motion.div>
      </div>
    </TooltipProvider>
  );
};

export default VerificarLaudo;
