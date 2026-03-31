import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useVerification } from './useVerification';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';
import { VerificationCard } from './VerificationCard';
import { ExecutiveSummaryCard } from './ExecutiveSummaryCard';
import { StatisticsCard } from './StatisticsCard';
import { InvariantsCard } from './InvariantsCard';

const VerificarLaudo: React.FC = () => {
  const { verificationResult, loading, error, actualLaudoId, isExpired, isIntegrityValid, isFullyValid } = useVerification();

  if (loading) return <LoadingState />;
  if (error || !verificationResult) return <ErrorState error={error} />;

  const report = verificationResult.report;
  const execSummary = report?.executive_summary;
  const stats = report?.statistics;
  const invariants = report?.invariants;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 py-8 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-3xl mx-auto space-y-6"
        >
          <VerificationCard
            verificationResult={verificationResult}
            isFullyValid={isFullyValid}
            isIntegrityValid={isIntegrityValid}
            isExpired={isExpired}
          />

          {execSummary && <ExecutiveSummaryCard summary={execSummary} />}

          {stats && <StatisticsCard stats={stats} />}

          {invariants && invariants.length > 0 && (
            <InvariantsCard invariants={invariants} summary={report?.invariants_summary} />
          )}

          {verificationResult.verification?.compliance_standards && (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {verificationResult.verification.compliance_standards.map((standard) => (
                <Badge key={standard} variant="outline" className="text-xs">
                  {standard}
                </Badge>
              ))}
            </div>
          )}

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

          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} CyberShield - Proteção Inteligente para Seus Endpoints
          </p>
        </motion.div>
      </div>
    </TooltipProvider>
  );
};

export default VerificarLaudo;
