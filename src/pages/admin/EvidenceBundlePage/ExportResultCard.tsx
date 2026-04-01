import { formatBytes } from '@/hooks/useEvidenceBundle';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, FileJson, FileDown, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ExportResult } from './constants';
import { generatePDF } from './generatePDF';

interface ExportResultCardProps {
  result: ExportResult;
  onReset: () => void;
}

export function ExportResultCard({ result, onReset }: ExportResultCardProps) {
  const downloadJSON = () => {
    if (!result.bundle) return;
    const blob = new Blob([JSON.stringify(result.bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-bundle-${result.auditId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    if (!result.bundle) return;
    const { loadLogoForPDF } = await import('@/lib/pdfLogoHelper');
    const logoDataUrl = await loadLogoForPDF();
    const doc = await generatePDF(result.bundle, result, logoDataUrl);
    doc.save(`evidence-bundle-${result.auditId}.pdf`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-primary/10">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Bundle Exportado com Sucesso</h3>
                <p className="text-sm text-muted-foreground">
                  {result.recordCount} registros · {formatBytes(result.sizeBytes)}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-card">
                  <p className="text-xs text-muted-foreground mb-1">Audit ID</p>
                  <p className="font-mono text-sm">{result.auditId}</p>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <p className="text-xs text-muted-foreground mb-1">SHA-256 Hash</p>
                  <p className="font-mono text-[10px] break-all">{result.manifestHash}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={downloadJSON} variant="outline" size="sm">
                  <FileJson className="h-4 w-4 mr-2" />
                  Baixar JSON
                </Button>
                <Button onClick={downloadPDF} variant="outline" size="sm">
                  <FileDown className="h-4 w-4 mr-2" />
                  Baixar PDF
                </Button>
                {result.verificationUrl && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={result.verificationUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Verificar Online
                    </a>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onReset}>
                  Novo Export
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
