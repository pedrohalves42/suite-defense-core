import React from 'react';
import { ShieldCheck, ShieldX, AlertTriangle, Calendar, Clock, Lock, Hash, Fingerprint, Info, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { Building2 } from 'lucide-react';
import type { VerificationResponse } from './types';
import { getRiskColor, getRiskInfo, getTrendIcon } from './helpers';

interface VerificationCardProps {
  verificationResult: VerificationResponse;
  isFullyValid: boolean;
  isIntegrityValid: boolean;
  isExpired: boolean;
}

export const VerificationCard: React.FC<VerificationCardProps> = ({
  verificationResult, isFullyValid, isIntegrityValid, isExpired
}) => {
  const report = verificationResult.report;
  const integrity = verificationResult.integrity;
  const riskInfo = getRiskInfo(report?.risk_level ?? null);

  return (
    <Card className={`border-2 ${isFullyValid ? 'border-green-500' : isIntegrityValid ? 'border-amber-500' : 'border-destructive'}`}>
      <CardHeader className="text-center pb-2">
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
        {/* Explanation */}
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
              <><strong>Este documento é autêntico e válido.</strong> Ele foi gerado pelo sistema CyberShield e não sofreu nenhuma alteração desde sua criação. Você pode confiar nas informações contidas nele.</>
            ) : isExpired ? (
              <><strong>Este documento expirou.</strong> Relatórios de compliance são válidos por 30 dias. Solicite um novo relatório para obter informações atualizadas.</>
            ) : isIntegrityValid ? (
              <><strong>O documento não foi alterado</strong>, mas há um problema com seu status. Entre em contato com o suporte para mais informações.</>
            ) : (
              <><strong>Não foi possível verificar a autenticidade deste documento.</strong> Ele pode ter sido alterado ou corrompido. Não confie nas informações contidas nele.</>
            )}
          </p>
        </div>

        {/* Crypto verification */}
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

        {/* Risk Score */}
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

        {/* Dates */}
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
  );
};
