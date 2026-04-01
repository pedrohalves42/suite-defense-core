import { formatBytes, BUNDLE_TYPE_LABELS } from '@/hooks/useEvidenceBundle';
import type { EvidenceBundle } from '@/hooks/useEvidenceBundle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, FileText, Hash, Shield, Clock, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, ptBR } from '@/lib/date-utils';

interface BundleHistoryPanelProps {
  bundles: EvidenceBundle[] | undefined;
  isLoading: boolean;
}

export function BundleHistoryPanel({ bundles, isLoading }: BundleHistoryPanelProps) {
  return (
    <div className="space-y-6">
      {/* Guarantees */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Garantias do Bundle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Hash className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
            <span>Hash SHA-256 para verificação de integridade — qualquer alteração invalida o bundle</span>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
            <span>Trilha de auditoria imutável protegida por triggers de banco de dados</span>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
            <span>Timestamps precisos com fuso horário para conformidade legal</span>
          </div>
          <div className="flex items-start gap-2">
            <FileText className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
            <span>Formatos PDF (legível) + JSON (verificável programaticamente)</span>
          </div>
        </CardContent>
      </Card>

      {/* Export History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Histórico de Exports
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : bundles && bundles.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {bundles.map((bundle, idx) => (
                <motion.div
                  key={bundle.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  className="p-3 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-[10px]">
                      {BUNDLE_TYPE_LABELS[bundle.bundle_type]}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(bundle.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono">{bundle.audit_id.slice(0, 12)}</span>
                    <span>·</span>
                    <span>{bundle.file_count} reg</span>
                    <span>·</span>
                    <span>{formatBytes(bundle.total_size_bytes)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-xs text-muted-foreground">Nenhum bundle exportado</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
