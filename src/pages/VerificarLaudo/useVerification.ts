import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { VerificationResponse } from './types';

export function useVerification() {
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
              .from('tenants_safe')
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

  return { verificationResult, loading, error, actualLaudoId, isExpired, isIntegrityValid, isFullyValid };
}
